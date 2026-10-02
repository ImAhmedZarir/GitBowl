import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { syncFilesToGoogleDrive } from "@/lib/gdrive.server";

export const Route = createFileRoute("/api/internal/drive-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Authenticate via internal worker secret or service role
        const secretHeader = request.headers.get("x-internal-secret");
        const authHeader = request.headers.get("authorization");
        const expectedSecret = process.env["INTERNAL_WORKER_SECRET"];

        const isSecretValid =
          expectedSecret &&
          secretHeader &&
          secretHeader.length === expectedSecret.length &&
          secretHeader === expectedSecret;

        const isServiceRole =
          authHeader &&
          process.env["SUPABASE_SERVICE_ROLE_KEY"] &&
          authHeader === `Bearer ${process.env["SUPABASE_SERVICE_ROLE_KEY"]}`;

        if (!isSecretValid && !isServiceRole) {
          return new Response(JSON.stringify({ error: "Unauthorized worker access" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          // Fetch up to 10 pending backup tasks
          const now = new Date().toISOString();
          const { data: jobs, error: fetchErr } = await supabaseAdmin
            .from("storage_backups")
            .select("id, repo_id, sha, attempts, repositories(name, profiles!repositories_owner_id_fkey(username))")
            .in("status", ["pending", "failed"])
            .lte("next_attempt_at", now)
            .lt("attempts", 8)
            .limit(10);

          if (fetchErr || !jobs || jobs.length === 0) {
            return new Response(JSON.stringify({ processed: 0, message: "Queue is empty" }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          let processed = 0;
          for (const job of jobs) {
            const repoData = job.repositories as any;
            const repoName = repoData?.name;
            const ownerName = repoData?.profiles?.username || "developer";

            if (!repoName) {
              await supabaseAdmin
                .from("storage_backups")
                .update({ status: "failed", last_error: "Repository deleted" })
                .eq("id", job.id);
              continue;
            }

            // Fetch repo files for this commit
            const { data: files } = await supabaseAdmin
              .from("repo_files")
              .select("path, content, is_binary")
              .eq("repo_id", job.repo_id);

            try {
              if (files && files.length > 0) {
                await syncFilesToGoogleDrive(
                  ownerName,
                  repoName,
                  files.map((f) => ({
                    path: f.path,
                    content: f.content,
                    is_binary: Boolean(f.is_binary),
                  })),
                );
              }

              await supabaseAdmin
                .from("storage_backups")
                .update({
                  status: "done",
                  completed_at: new Date().toISOString(),
                })
                .eq("id", job.id);

              processed++;
            } catch (err: any) {
              const attempts = (job.attempts || 0) + 1;
              const nextAttempt = new Date(Date.now() + Math.pow(2, attempts) * 1000 * 60).toISOString();
              await supabaseAdmin
                .from("storage_backups")
                .update({
                  attempts,
                  next_attempt_at: nextAttempt,
                  last_error: err?.message || "Backup failed",
                  status: attempts >= 8 ? "failed" : "pending",
                })
                .eq("id", job.id);
            }
          }

          return new Response(JSON.stringify({ processed }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          console.error("[Drive Worker] Error:", err);
          return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
