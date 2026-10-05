// src/routes/api/repo/webhook-deliveries.ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { deliverWebhook } from "@/lib/webhooks.server";

export const Route = createFileRoute("/api/repo/webhook-deliveries")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const webhookId = url.searchParams.get("webhookId");
          if (!webhookId) {
            return new Response(JSON.stringify({ error: "Missing webhookId" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const supabase = getSupabaseAdmin();
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
            headers: { "Content-Type": "application/json" },
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
          const authHeader = request.headers.get("authorization");
          if (!authHeader) {
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
          const { data: hook, error: hookError } = await supabase
            .from("webhooks" as any)
            .select("id, url, secret, repo_id, repositories(name)")
            .eq("id", webhookId)
            .single();

          if (hookError || !hook) {
            return new Response(JSON.stringify({ error: "Webhook not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          const hookRow = hook as any;
          const payload = {
            zen: "Anything added dilutes everything else.",
            hook_id: hookRow.id,
            action,
            repository: { id: hookRow.repo_id, name: hookRow.repositories?.name },
            sender: { login: "gitbowl-system" },
          };

          const result = await deliverWebhook({
            webhookId: hookRow.id,
            url: hookRow.url,
            secret: hookRow.secret,
            event: "ping",
            payload,
          });

          return new Response(JSON.stringify({ delivery: result }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: err.message || "Failed to deliver webhook" }),
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
