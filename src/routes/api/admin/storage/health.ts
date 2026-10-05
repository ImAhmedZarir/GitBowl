// src/routes/api/admin/storage/health.ts
import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin, recordAuditLog } from "@/lib/admin.server";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/admin/storage/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const admin = await requireAdmin(request);
          const supabase = getSupabaseAdmin();

          // 1. Storage files count and size in primary store
          const { data: fileStats } = await supabase.from("repo_files").select("size");

          let totalBytes = 0;
          let fileCount = 0;
          if (fileStats) {
            fileCount = fileStats.length;
            for (const f of fileStats) {
              totalBytes += Number(f.size) || 0;
            }
          }

          // 2. Outbox Queue stats
          const { data: queueItems } = await supabase
            .from("storage_backups" as any)
            .select("status, size");

          let pendingCount = 0;
          let failedCount = 0;
          let doneCount = 0;
          let backupBytes = 0;

          if (queueItems) {
            for (const item of queueItems as any[]) {
              if (item.status === "pending" || item.status === "uploading") pendingCount++;
              else if (item.status === "failed") failedCount++;
              else if (item.status === "done") {
                doneCount++;
                backupBytes += Number(item.size) || 0;
              }
            }
          }

          // 3. Failed jobs list for retry actions
          const { data: failedJobs } = await supabase
            .from("storage_backups" as any)
            .select("id, repo_id, sha, attempts, last_error, created_at, repositories(name)")
            .eq("status", "failed")
            .order("created_at", { ascending: false })
            .limit(20);

          // 4. Drive config (MASKED)
          const rawEmail = process.env["GDRIVE_CLIENT_EMAIL"] || "";
          const rawFolder =
            process.env["GDRIVE_ROOT_FOLDER_ID"] || process.env["GDRIVE_SHARED_DRIVE_ID"] || "";
          const maskedEmail = rawEmail
            ? rawEmail.slice(0, 3) + "***@" + rawEmail.split("@")[1]
            : "configured-via-secret";
          const maskedFolder = rawFolder ? "***" + rawFolder.slice(-6) : "configured-root";

          await recordAuditLog({
            actorId: admin.id,
            action: "admin.view_storage_health",
            targetType: "storage",
            ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
          });

          return new Response(
            JSON.stringify({
              status: "connected",
              primaryStorage: {
                totalBytes,
                fileCount,
                provider: "Supabase Postgres / Blob Storage",
              },
              backupTier: {
                provider: "Google Drive Backup Tier",
                maskedServiceAccount: maskedEmail,
                maskedFolderId: maskedFolder,
                completedJobs: doneCount,
                pendingJobs: pendingCount,
                failedJobsCount: failedCount,
                totalBackupBytes: backupBytes,
              },
              failedJobs: failedJobs ?? [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (err: any) {
          if (err instanceof Response) return err;
          return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
