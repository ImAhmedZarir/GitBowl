// src/routes/api/repo/webhooks.ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { getActor, requireRepoAccess } from "@/lib/authz.server";

function validateWebhookUrl(urlStr: string): { valid: boolean; error?: string } {
  try {
    const u = new URL(urlStr);
    const isDev = process.env.NODE_ENV === "development";
    if (u.protocol !== "https:" && !(isDev && u.protocol === "http:")) {
      return { valid: false, error: "Webhook URL must use HTTPS" };
    }

    const host = u.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "0.0.0.0" ||
      host === "169.254.169.254" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
      /^169\.254\./.test(host)
    ) {
      return { valid: false, error: "Private, loopback, and metadata network addresses are blocked" };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid webhook URL format" };
  }
}

export const Route = createFileRoute("/api/repo/webhooks")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const actor = await getActor(request);
          if (!actor) {
            return new Response(JSON.stringify({ error: "Authentication required" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

          const url = new URL(request.url);
          const repoId = url.searchParams.get("repoId");
          if (!repoId) {
            return new Response(JSON.stringify({ error: "Missing repoId" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const supabase = getSupabaseAdmin();
          const { data: repo } = await supabase
            .from("repositories")
            .select("id, is_private, owner_id, org_id")
            .eq("id", repoId)
            .maybeSingle();

          if (!repo) {
            return new Response(JSON.stringify({ error: "Repository not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          const access = await requireRepoAccess(actor, repo, "admin");
          if (!access.allowed) {
            return new Response(JSON.stringify({ error: "Admin access required" }), {
              status: 403,
              headers: { "Content-Type": "application/json" },
            });
          }

          const { data: webhooks, error } = await supabase
            .from("webhooks" as any)
            .select("id, url, events, is_active, created_at")
            .eq("repo_id", repoId)
            .order("created_at", { ascending: false });

          if (error) throw error;

          return new Response(JSON.stringify({ webhooks: webhooks || [] }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "private, no-store",
            },
          });
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: err.message || "Failed to fetch webhooks" }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      },

      POST: async ({ request }) => {
        try {
          const actor = await getActor(request);
          if (!actor) {
            return new Response(JSON.stringify({ error: "Authentication required" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

          const body = await request.json().catch(() => ({}));
          const { repoId, url: hookUrl, secret = "", events = ["push"] } = body;

          if (!repoId || !hookUrl) {
            return new Response(JSON.stringify({ error: "Missing required fields" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const urlValidation = validateWebhookUrl(hookUrl);
          if (!urlValidation.valid) {
            return new Response(JSON.stringify({ error: urlValidation.error }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const cleanSecret = (secret || "").trim();
          if (cleanSecret && cleanSecret.length < 16) {
            return new Response(
              JSON.stringify({ error: "Webhook secret must be at least 16 characters for cryptographic HMAC security" }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              },
            );
          }

          const supabase = getSupabaseAdmin();
          const { data: repo } = await supabase
            .from("repositories")
            .select("id, is_private, owner_id, org_id")
            .eq("id", repoId)
            .maybeSingle();

          if (!repo) {
            return new Response(JSON.stringify({ error: "Repository not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          const access = await requireRepoAccess(actor, repo, "admin");
          if (!access.allowed) {
            return new Response(JSON.stringify({ error: "Only repository administrators can configure webhooks" }), {
              status: 403,
              headers: { "Content-Type": "application/json" },
            });
          }

          const { data: newHook, error: insertError } = await supabase
            .from("webhooks" as any)
            .insert({
              repo_id: repoId,
              url: hookUrl.trim(),
              secret: cleanSecret,
              events: Array.isArray(events) ? events : [events],
              is_active: true,
            })
            .select("id, url, events, is_active, created_at")
            .single();

          if (insertError) throw insertError;

          return new Response(JSON.stringify({ webhook: newHook }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: err.message || "Failed to create webhook" }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      },

      DELETE: async ({ request }) => {
        try {
          const actor = await getActor(request);
          if (!actor) {
            return new Response(JSON.stringify({ error: "Authentication required" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

          const body = await request.json().catch(() => ({}));
          const { webhookId } = body;

          if (!webhookId) {
            return new Response(JSON.stringify({ error: "Missing webhookId" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const supabase = getSupabaseAdmin();
          const { data: hook } = await supabase
            .from("webhooks" as any)
            .select("id, repo_id, repositories(id, is_private, owner_id, org_id)")
            .eq("id", webhookId)
            .maybeSingle();

          if (!hook) {
            return new Response(JSON.stringify({ error: "Webhook not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          const repo = (hook as any).repositories;
          const access = await requireRepoAccess(actor, repo, "admin");
          if (!access.allowed) {
            return new Response(JSON.stringify({ error: "Admin access required" }), {
              status: 403,
              headers: { "Content-Type": "application/json" },
            });
          }

          const { error } = await supabase
            .from("webhooks" as any)
            .delete()
            .eq("id", webhookId);

          if (error) throw error;

          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: err.message || "Failed to delete webhook" }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      },
    },
  },
});
