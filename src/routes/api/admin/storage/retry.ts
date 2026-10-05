// src/routes/api/admin/storage/retry.ts
import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin, recordAuditLog } from "@/lib/admin.server";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/admin/storage/retry")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const admin = await requireAdmin(request);
          const supabase = getSupabaseAdmin();
          const body = await request.json().catch(() => ({}));
          const { jobId } = body;

          let updatedCount = 0;
          if (jobId) {
            const { error } = await supabase
              .from("storage_backups" as any)
              .update({
                status: "pending",
                attempts: 0,
                next_attempt_at: new Date().toISOString(),
                last_error: null,
              })
              .eq("id", jobId);

            if (error) throw error;
            updatedCount = 1;
          } else {
            // Retry all failed jobs
            const { error, count } = await supabase
              .from("storage_backups" as any)
              .update({
                status: "pending",
                attempts: 0,
                next_attempt_at: new Date().toISOString(),
                last_error: null,
              })
              .eq("status", "failed");

            if (error) throw error;
            updatedCount = count || 0;
          }

          await recordAuditLog({
            actorId: admin.id,
            action: jobId ? "admin.retry_backup_job" : "admin.retry_all_failed_backups",
            targetType: "storage_backup",
            targetId: jobId || "all",
            metadata: { count: updatedCount },
            ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
          });

          return new Response(JSON.stringify({ success: true, retriedCount: updatedCount }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          if (err instanceof Response) return err;
          return new Response(JSON.stringify({ error: err.message || "Failed to retry jobs" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
