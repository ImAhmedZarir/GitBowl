// src/routes/api/repo/webhook-deliveries.ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { getActor, requireRepoAccess } from "@/lib/authz.server";
import { deliverWebhook } from "@/lib/webhooks.server";

export const Route = createFileRoute("/api/repo/webhook-deliveries")({
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
          const webhookId = url.searchParams.get("webhookId");
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

          const { data: deliveries, error } = await supabase
            .from("webhook_deliveries" as any)
            .select(
              "id, event, status_code, duration_ms, error, created_at, payload, response_body",
            )
            .eq("webhook_id", webhookId)
            .order("created_at", { ascending: false })
            .limit(20);

          if (error) throw error;

          return new Response(JSON.stringify({ deliveries: deliveries || [] }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "private, no-store",
            },
          });
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: err.message || "Failed to fetch deliveries" }),
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
          const { webhookId, action = "ping" } = body;

          if (!webhookId) {
            return new Response(JSON.stringify({ error: "Missing webhookId" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const supabase = getSupabaseAdmin();
          const { data: webhook, error } = await supabase
            .from("webhooks" as any)
            .select("*, repositories(id, is_private, owner_id, org_id)")
            .eq("id", webhookId)
            .single();

          if (error || !webhook) {
            return new Response(JSON.stringify({ error: "Webhook not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          const repo = (webhook as any).repositories;
          const access = await requireRepoAccess(actor, repo, "admin");
          if (!access.allowed) {
            return new Response(JSON.stringify({ error: "Admin access required" }), {
              status: 403,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (action === "ping") {
            const result = await deliverWebhook(webhook, "ping", {
              zen: "Keep it logically awesome.",
              hook_id: webhook.id,
              hook: {
                events: webhook.events,
                active: webhook.is_active,
              },
            });

            return new Response(JSON.stringify({ success: result.success, delivery: result }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          return new Response(JSON.stringify({ error: "Unknown action" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: err.message || "Failed to process delivery action" }),
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
