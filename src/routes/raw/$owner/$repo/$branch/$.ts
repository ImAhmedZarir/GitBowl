// src/routes/raw/$owner/$repo/$branch/$.ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/raw/$owner/$repo/$branch/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { owner, repo: repoName, _splat: rawFilePath } = params as any;
          const filePath = decodeURIComponent(rawFilePath || "");

          const supabase = getSupabaseAdmin();

          // 1. Fetch repo
          const { data: repo } = await supabase
            .from("repositories")
            .select("id, is_private, profiles!repositories_owner_id_fkey(username)")
            .eq("name", repoName)
            .single();

          if (!repo) {
            return new Response("Repository not found", { status: 404 });
          }

          // 2. Fetch file content from repo_files
          const { data: file } = await supabase
            .from("repo_files")
            .select("content, is_binary, path")
            .eq("repo_id", repo.id)
            .eq("path", filePath)
            .single();

          if (!file) {
            return new Response("File not found", { status: 404 });
          }

          if (file.is_binary) {
            const buffer = Buffer.from(file.content, "base64");
            return new Response(buffer, {
              status: 200,
              headers: {
                "Content-Type": "application/octet-stream",
                "Cache-Control": "public, max-age=3600",
              },
            });
          }

          return new Response(file.content, {
            status: 200,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "public, max-age=3600",
            },
          });
        } catch (err: any) {
          return new Response(err.message || "Failed to serve raw file", { status: 500 });
        }
      },
    },
  },
});
