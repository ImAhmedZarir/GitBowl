// src/routes/raw/$owner/$repo/$branch/$.ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { getActor, findRepo, requireRepoAccess } from "@/lib/authz.server";

export const Route = createFileRoute("/raw/$owner/$repo/$branch/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { owner, repo: repoName, _splat: rawFilePath } = params as any;
          const filePath = decodeURIComponent(rawFilePath || "");

          // 1. Resolve repository strictly by exact owner and repo name
          const repo = await findRepo(owner, repoName);
          if (!repo) {
            return new Response("Not Found", {
              status: 404,
              headers: { "X-Content-Type-Options": "nosniff" },
            });
          }

          // 2. Enforce authorization layer
          const actor = await getActor(request);
          const access = await requireRepoAccess(actor, repo, "read");
          if (!access.allowed) {
            return new Response("Not Found", {
              status: access.status || 404,
              headers: { "X-Content-Type-Options": "nosniff" },
            });
          }

          // 3. Fetch file content
          const supabase = getSupabaseAdmin();
          const { data: file } = await supabase
            .from("repo_files")
            .select("content, is_binary, path")
            .eq("repo_id", repo.id)
            .eq("path", filePath)
            .maybeSingle();

          if (!file) {
            return new Response("File not found", {
              status: 404,
              headers: { "X-Content-Type-Options": "nosniff" },
            });
          }

          const isPrivate = Boolean(repo.is_private);
          const cacheControl = isPrivate ? "private, no-store" : "public, max-age=3600";
          const fileName = filePath.split("/").pop() || "file";

          if (file.is_binary) {
            const buffer = Buffer.from(file.content, "base64");
            return new Response(buffer, {
              status: 200,
              headers: {
                "Content-Type": "application/octet-stream",
                "X-Content-Type-Options": "nosniff",
                "Content-Disposition": `attachment; filename="${fileName}"`,
                "Cache-Control": cacheControl,
              },
            });
          }

          return new Response(file.content, {
            status: 200,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "X-Content-Type-Options": "nosniff",
              "Cache-Control": cacheControl,
            },
          });
        } catch (err: any) {
          return new Response(err.message || "Failed to serve raw file", {
            status: 500,
            headers: { "X-Content-Type-Options": "nosniff" },
          });
        }
      },
    },
  },
});
