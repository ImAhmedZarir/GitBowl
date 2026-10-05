// src/routes/api/admin/audit-logs.ts
import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/admin.server";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/admin/audit-logs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireAdmin(request);
          const url = new URL(request.url);
          const limit = Math.min(100, Math.max(10, Number(url.searchParams.get("limit")) || 30));
          const actionFilter = url.searchParams.get("action");

          const supabase = getSupabaseAdmin();
          let query = supabase
            .from("audit_log" as any)
            .select(
              "id, action, target_type, target_id, metadata, ip, created_at, profiles!audit_log_actor_id_fkey(username, display_name)",
            )
            .order("created_at", { ascending: false })
            .limit(limit);

          if (actionFilter) {
            query = query.ilike("action", `%${actionFilter}%`);
          }

          const { data: logs, error } = await query;
          if (error) throw error;

          return new Response(JSON.stringify({ logs: logs ?? [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          if (err instanceof Response) return err;
          return new Response(
            JSON.stringify({ error: err.message || "Failed to fetch audit logs" }),
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
