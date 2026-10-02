import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { syncFilesToGoogleDrive } from "@/lib/gdrive.server";

export const Route = createFileRoute("/api/repo/commit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { repoId, authorId, message, files } = body;

          if (!repoId) {
            return new Response(JSON.stringify({ error: "Repository ID is required" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (!files || !Array.isArray(files) || files.length === 0) {
            return new Response(JSON.stringify({ error: "No files to commit" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const commitMsg = (message || "").trim() || "Update files";

          // 1. Fetch repository
          const { data: repo, error: repoErr } = await supabaseAdmin
            .from("repositories")
            .select("id, name, owner_id")
            .eq("id", repoId)
            .single();

          if (repoErr || !repo) {
            return new Response(JSON.stringify({ error: "Repository not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          const { data: ownerProfile } = await supabaseAdmin
            .from("profiles")
            .select("username")
            .eq("id", repo.owner_id)
            .maybeSingle();

          // 2. Prepare and upsert file rows
          const now = new Date().toISOString();
          const upserts = files.map((f: any) => ({
            repo_id: repoId,
            path: f.path,
            content: f.content ?? "",
            is_binary: Boolean(f.is_binary),
            size: typeof f.content === "string" ? f.content.length : 0,
            updated_at: now,
          }));

          const { error: upsertErr } = await supabaseAdmin
            .from("repo_files")
            .upsert(upserts, { onConflict: "repo_id,path" });

          if (upsertErr) {
            console.error("Upsert files error:", upsertErr);
            return new Response(JSON.stringify({ error: upsertErr.message }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          // 3. Insert commit record
          const { data: newCommit, error: commitErr } = await supabaseAdmin
            .from("commits")
            .insert({
              repo_id: repoId,
              author_id: authorId || null,
              message: commitMsg,
              changes: files.map((f: any) => ({ path: f.path, type: "modified" })),
            })
            .select()
            .single();

          if (commitErr) {
            console.error("Insert commit error:", commitErr);
          }

          // 4. Update repository updated_at timestamp
          await supabaseAdmin.from("repositories").update({ updated_at: now }).eq("id", repoId);

          // 5. Mirror changes to Google Drive in the background
          const repoOwner = ownerProfile?.username || "developer";
          syncFilesToGoogleDrive(
            repoOwner,
            repo.name,
            files.map((f: any) => ({
              path: f.path,
              content: f.content,
              is_binary: Boolean(f.is_binary),
            })),
          ).catch((e) => console.warn("[GDrive] Commit mirror warning:", e));

          return new Response(
            JSON.stringify({
              success: true,
              commitId: newCommit?.id,
              commit: newCommit,
              filesCount: files.length,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (err: any) {
          console.error("Commit endpoint error:", err);
          return new Response(
            JSON.stringify({ error: err.message || "Failed to commit changes" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
