// src/routes/api/repo/webhooks.ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/repo/webhooks")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization");
          if (!authHeader) {
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
          const { data: webhooks, error } = await supabase
            .from("webhooks" as any)
            .select("id, url, events, is_active, created_at")
            .eq("repo_id", repoId)
            .order("created_at", { ascending: false });

          if (error) throw error;

          return new Response(JSON.stringify({ webhooks: webhooks || [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
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
          const authHeader = request.headers.get("authorization");
          if (!authHeader) {
            return new Response(JSON.stringify({ error: "Authentication required" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

          const supabase = getSupabaseAdmin();
          const token = authHeader.replace(/^Bearer\s+/i, "").trim();
          const { data: userData, error: authError } = await supabase.auth.getUser(token);
          if (authError || !userData?.user) {
            return new Response(JSON.stringify({ error: "Invalid token" }), {
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

          try {
            new URL(hookUrl);
          } catch {
            return new Response(JSON.stringify({ error: "Invalid webhook URL format" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const { data: newHook, error: insertError } = await supabase
            .from("webhooks" as any)
            .insert({
              repo_id: repoId,
              url: hookUrl.trim(),
              secret: secret.trim(),
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
          const authHeader = request.headers.get("authorization");
          if (!authHeader) {
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
