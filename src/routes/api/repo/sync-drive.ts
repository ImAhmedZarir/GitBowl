import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { syncFilesToGoogleDrive, deleteFile } from "@/lib/gdrive.server";

export const Route = createFileRoute("/api/repo/sync-drive")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { repoId, owner, repoName, files, deletedPaths } = body;

          let targetOwner = owner;
          let targetRepoName = repoName;

          if (!targetOwner || !targetRepoName) {
            if (!repoId) {
              return new Response(JSON.stringify({ error: "Missing repoId or owner/repoName" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
              });
            }

            const { data: repoData, error: repoError } = await supabaseAdmin
              .from("repositories")
              .select("name, owner_id, profiles:owner_id(username)")
              .eq("id", repoId)
              .single();

            if (repoError || !repoData) {
              return new Response(JSON.stringify({ error: "Repository not found" }), {
                status: 404,
                headers: { "Content-Type": "application/json" },
              });
            }

            targetRepoName = repoData.name;
            const profile = repoData.profiles as any;
            targetOwner = profile?.username || "developer";
          }

          let syncedCount = 0;
          if (Array.isArray(files) && files.length > 0) {
            const syncResult = await syncFilesToGoogleDrive(targetOwner, targetRepoName, files);
            syncedCount = syncResult.syncedCount;
          }

          let deletedCount = 0;
          if (Array.isArray(deletedPaths) && deletedPaths.length > 0) {
            for (const p of deletedPaths) {
              try {
                const key = `repos/${targetOwner}/${targetRepoName}/${p.replace(/^\/+/, "")}`;
                await deleteFile(key);
                deletedCount++;
              } catch (e) {
                console.warn(`[GDrive] Error deleting ${p}:`, e);
              }
            }
          }

          return new Response(
            JSON.stringify({
              success: true,
              syncedCount,
              deletedCount,
              folder: `GitBowl-Store/repos/${targetOwner}/${targetRepoName}`,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: err.message || "Failed to sync to Google Drive" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
