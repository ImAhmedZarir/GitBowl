// src/routes/api/repo/sync-gdrive.ts
// On-demand Google Drive synchronization for repositories
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { syncFilesToGoogleDrive } from "@/lib/gdrive.server";
import { createNotification } from "@/lib/notifications.server";

export const Route = createFileRoute("/api/repo/sync-gdrive")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization");
          if (!authHeader?.startsWith("Bearer ")) {
            return new Response(JSON.stringify({ error: "Authentication required" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

          const supabase = getSupabaseAdmin();
          const {
            data: { user },
            error: authError,
          } = await supabase.auth.getUser(authHeader.slice(7));

          if (authError || !user) {
            return new Response(JSON.stringify({ error: "Invalid session" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

          const body = (await request.json().catch(() => ({}))) as {
            repoId?: string;
            repoName?: string;
          };

          if (!body.repoId && !body.repoName) {
            return new Response(JSON.stringify({ error: "Repository identifier required" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Fetch repository
          let repoQuery = supabase
            .from("repositories")
            .select("id, name, owner_id, profiles!repositories_owner_id_fkey(username)");

          if (body.repoId) {
            repoQuery = repoQuery.eq("id", body.repoId);
          } else if (body.repoName) {
            repoQuery = repoQuery.eq("name", body.repoName).eq("owner_id", user.id);
          }

          const { data: repo, error: repoErr } = await repoQuery.single();

          if (repoErr || !repo) {
            return new Response(JSON.stringify({ error: "Repository not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Verify ownership or admin
          const isOwner = repo.owner_id === user.id;
          const { data: profile } = await supabase
            .from("profiles")
            .select("role, username")
            .eq("id", user.id)
            .single();

          const isAdmin = profile?.role === "admin";

          if (!isOwner && !isAdmin) {
            return new Response(JSON.stringify({ error: "Forbidden" }), {
              status: 403,
              headers: { "Content-Type": "application/json" },
            });
          }

          const ownerUsername =
            (repo.profiles as any)?.username || profile?.username || "developer";

          // Fetch all repo files
          const { data: files } = await supabase
            .from("repo_files")
            .select("path, content, is_binary")
            .eq("repo_id", repo.id);

          if (!files || files.length === 0) {
            return new Response(
              JSON.stringify({
                success: true,
                syncedCount: 0,
                message: "Repository has no files to sync",
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }

          const syncResult = await syncFilesToGoogleDrive(ownerUsername, repo.name, files);
          const totalBytes = files.reduce((acc, f) => acc + (f.content?.length || 0), 0);

          await supabase.from("storage_backups" as any).upsert(
            {
              repo_id: repo.id,
              kind: "manifest",
              sha: "head",
              status: syncResult.success ? "done" : "failed",
              size: totalBytes,
              attempts: 1,
              completed_at: syncResult.success ? new Date().toISOString() : null,
              last_error: syncResult.errors.length
                ? syncResult.errors.slice(0, 3).join("; ")
                : null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "repo_id,sha" },
          );

          await createNotification({
            userId: user.id,
            type: "sync",
            title: `Google Drive Sync: ${repo.name}`,
            content: `Synchronized ${syncResult.syncedCount} of ${files.length} files to Google Drive.`,
            link: `/${ownerUsername}/${repo.name}`,
          });

          return new Response(
            JSON.stringify({
              success: syncResult.success,
              syncedCount: syncResult.syncedCount,
              totalFiles: files.length,
              errors: syncResult.errors,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: err?.message || "Failed to sync with Google Drive" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
