// src/routes/pages/$owner/$repo/$.ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";

function getMimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "html":
    case "htm":
      return "text/html; charset=utf-8";
    case "css":
      return "text/css; charset=utf-8";
    case "js":
    case "mjs":
      return "application/javascript; charset=utf-8";
    case "json":
      return "application/json; charset=utf-8";
    case "svg":
      return "image/svg+xml";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "ico":
      return "image/x-icon";
    case "txt":
      return "text/plain; charset=utf-8";
    case "woff":
      return "font/woff";
    case "woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

export const Route = createFileRoute("/pages/$owner/$repo/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { owner, repo: repoName, _splat } = params as any;
          const rawSubpath = decodeURIComponent(_splat || "");
          const supabase = getSupabaseAdmin();

          // 1. Resolve repository by owner and name
          const { data: repo } = await supabase
            .from("repositories")
            .select("id, name, is_private, profiles!repositories_owner_id_fkey(username)")
            .eq("name", repoName)
            .single();

          if (!repo) {
            return new Response(
              `<!DOCTYPE html><html><head><title>404 - Not Found</title></head><body style="font-family:sans-serif;padding:2rem;"><h1>404 Not Found</h1><p>Repository ${owner}/${repoName} does not exist.</p></body></html>`,
              { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
            );
          }

          // 2. Fetch Pages configuration
          const { data: pagesConfig } = await supabase
            .from("pages_config" as any)
            .select("is_enabled, branch, path")
            .eq("repo_id", repo.id)
            .maybeSingle();

          const cfg = pagesConfig as any;
          if (!cfg || !cfg.is_enabled) {
            return new Response(
              `<!DOCTYPE html><html><head><title>GitBowl Pages Not Active</title></head><body style="font-family:sans-serif;padding:2rem;"><h1>GitBowl Pages</h1><p>GitBowl Pages is not enabled for ${owner}/${repoName}.</p><p><small>Enable it under Repository Settings &gt; Pages.</small></p></body></html>`,
              { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
            );
          }

          // 3. Resolve target file path within repo
          let basePath = (cfg.path || "").replace(/^\/+/, "").replace(/\/+$/, "");
          let relativeFile = rawSubpath.replace(/^\/+/, "");

          if (!relativeFile || relativeFile.endsWith("/")) {
            relativeFile += "index.html";
          }

          let fullRepoPath = basePath ? `${basePath}/${relativeFile}` : relativeFile;
          fullRepoPath = fullRepoPath.replace(/^\/+/, "");

          // 4. Fetch file content from repo_files
          const { data: file } = await supabase
            .from("repo_files")
            .select("content, is_binary, path")
            .eq("repo_id", repo.id)
            .eq("path", fullRepoPath)
            .maybeSingle();

          if (!file) {
            return new Response(
              `<!DOCTYPE html><html><head><title>404 - File Not Found</title></head><body style="font-family:sans-serif;padding:2rem;"><h1>404 - File Not Found</h1><p>The file <code>${fullRepoPath}</code> was not found in ${cfg.branch || "main"}.</p></body></html>`,
              { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
            );
          }

          const mimeType = getMimeType(fullRepoPath);

          if (file.is_binary) {
            const buffer = Buffer.from(file.content, "base64");
            return new Response(buffer, {
              status: 200,
              headers: {
                "Content-Type": mimeType,
                "Cache-Control": "public, max-age=600",
              },
            });
          }

          return new Response(file.content, {
            status: 200,
            headers: {
              "Content-Type": mimeType,
              "Cache-Control": "public, max-age=600",
            },
          });
        } catch (err: any) {
          return new Response(
            `<!DOCTYPE html><html><head><title>Server Error</title></head><body><h1>Server Error</h1><p>${err.message}</p></body></html>`,
            { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
        }
      },
    },
  },
});
