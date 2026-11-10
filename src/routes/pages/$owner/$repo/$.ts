// src/routes/pages/$owner/$repo/$.ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { getActor, findRepo, requireRepoAccess } from "@/lib/authz.server";

function escapeHtml(str: string): string {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

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
      GET: async ({ request, params }) => {
        try {
          const { owner, repo: repoName, _splat } = params as any;
          const rawSubpath = decodeURIComponent(_splat || "");

          // 1. Resolve repository by exact owner and repo name
          const repo = await findRepo(owner, repoName);
          if (!repo) {
            const safeOwner = escapeHtml(owner);
            const safeRepo = escapeHtml(repoName);
            return new Response(
              `<!DOCTYPE html><html><head><title>404 - Not Found</title></head><body style="font-family:sans-serif;padding:2rem;"><h1>404 Not Found</h1><p>Repository ${safeOwner}/${safeRepo} does not exist.</p></body></html>`,
              {
                status: 404,
                headers: {
                  "Content-Type": "text/html; charset=utf-8",
                  "X-Content-Type-Options": "nosniff",
                  "Content-Security-Policy": "sandbox; default-src 'none';",
                },
              },
            );
          }

          // 2. Enforce authorization
          const actor = await getActor(request);
          const access = await requireRepoAccess(actor, repo, "read");
          if (!access.allowed) {
            return new Response(
              `<!DOCTYPE html><html><head><title>404 - Not Found</title></head><body style="font-family:sans-serif;padding:2rem;"><h1>404 Not Found</h1></body></html>`,
              {
                status: 404,
                headers: {
                  "Content-Type": "text/html; charset=utf-8",
                  "X-Content-Type-Options": "nosniff",
                  "Content-Security-Policy": "sandbox; default-src 'none';",
                },
              },
            );
          }

          const supabase = getSupabaseAdmin();

          // 3. Fetch Pages configuration
          const { data: pagesConfig } = await supabase
            .from("pages_config" as any)
            .select("is_enabled, branch, path")
            .eq("repo_id", repo.id)
            .maybeSingle();

          const cfg = pagesConfig as any;
          if (!cfg || !cfg.is_enabled) {
            const safeOwner = escapeHtml(owner);
            const safeRepo = escapeHtml(repoName);
            return new Response(
              `<!DOCTYPE html><html><head><title>GitBowl Pages Not Active</title></head><body style="font-family:sans-serif;padding:2rem;"><h1>GitBowl Pages</h1><p>GitBowl Pages is not enabled for ${safeOwner}/${safeRepo}.</p><p><small>Enable it under Repository Settings &gt; Pages.</small></p></body></html>`,
              {
                status: 404,
                headers: {
                  "Content-Type": "text/html; charset=utf-8",
                  "X-Content-Type-Options": "nosniff",
                  "Content-Security-Policy": "sandbox; default-src 'none';",
                },
              },
            );
          }

          // 4. Resolve target file path within repo
          let basePath = (cfg.path || "").replace(/^\/+/, "").replace(/\/+$/, "");
          let relativeFile = rawSubpath.replace(/^\/+/, "");

          if (!relativeFile || relativeFile.endsWith("/")) {
            relativeFile += "index.html";
          }

          let fullRepoPath = basePath ? `${basePath}/${relativeFile}` : relativeFile;
          fullRepoPath = fullRepoPath.replace(/^\/+/, "");

          // 5. Fetch file content from repo_files
          const { data: file } = await supabase
            .from("repo_files")
            .select("content, is_binary, path")
            .eq("repo_id", repo.id)
            .eq("path", fullRepoPath)
            .maybeSingle();

          if (!file) {
            const safePath = escapeHtml(fullRepoPath);
            const safeBranch = escapeHtml(cfg.branch || "main");
            return new Response(
              `<!DOCTYPE html><html><head><title>404 - File Not Found</title></head><body style="font-family:sans-serif;padding:2rem;"><h1>404 - File Not Found</h1><p>The file <code>${safePath}</code> was not found in ${safeBranch}.</p></body></html>`,
              {
                status: 404,
                headers: {
                  "Content-Type": "text/html; charset=utf-8",
                  "X-Content-Type-Options": "nosniff",
                  "Content-Security-Policy": "sandbox; default-src 'none';",
                },
              },
            );
          }

          const mimeType = getMimeType(fullRepoPath);
          const isHtmlOrSvg = mimeType.includes("html") || mimeType.includes("svg");
          const isPrivate = Boolean(repo.is_private);
          const cacheControl = isPrivate ? "private, no-store" : "public, max-age=600";
          const fileName = fullRepoPath.split("/").pop() || "page";

          // Strictly sandbox pages responses and set attachment for html/svg on app origin
          const headers: Record<string, string> = {
            "Content-Type": mimeType,
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "sandbox allow-same-origin allow-scripts allow-popups; default-src 'self' 'unsafe-inline' data: blob: https:;",
            "Cache-Control": cacheControl,
          };

          if (isHtmlOrSvg) {
            headers["Content-Disposition"] = `attachment; filename="${fileName}"`;
          }

          if (file.is_binary) {
            const buffer = Buffer.from(file.content, "base64");
            return new Response(buffer, {
              status: 200,
              headers,
            });
          }

          return new Response(file.content, {
            status: 200,
            headers,
          });
        } catch (err: any) {
          const safeErr = escapeHtml(err.message || "Internal Error");
          return new Response(
            `<!DOCTYPE html><html><head><title>Server Error</title></head><body><h1>Server Error</h1><p>${safeErr}</p></body></html>`,
            {
              status: 500,
              headers: {
                "Content-Type": "text/html; charset=utf-8",
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": "sandbox; default-src 'none';",
              },
            },
          );
        }
      },
    },
  },
});
