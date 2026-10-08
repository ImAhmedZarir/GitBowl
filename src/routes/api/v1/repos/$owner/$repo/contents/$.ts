// src/routes/api/v1/repos/$owner/$repo/contents/$.ts
// GET, PUT, DELETE /api/v1/repos/:owner/:repo/contents/:path
import { createFileRoute } from "@tanstack/react-router";
import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { findRepo, hasRepoReadAccess, hasRepoWriteAccess } from "@/lib/git.server";
import { createCommit } from "@/lib/commit-service.server";
import { isBinaryPath } from "@/lib/repo";
import { sanitizeUnicode, sanitizeFilePath, sanitizeCommitMessage } from "@/lib/unicode";
import {
  authenticateApiV1,
  checkApiV1RateLimit,
  v1Response,
  v1RateLimitExceeded,
} from "@/lib/api-v1.server";

export const Route = createFileRoute("/api/v1/repos/$owner/$repo/contents/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await authenticateApiV1(request);
        const rateLimit = checkApiV1RateLimit(request, auth.userId);
        if (!rateLimit.allowed) return v1RateLimitExceeded(rateLimit);

        const { owner, repo: repoName, _splat: rawPath } = params;
        const filePath = (rawPath || "").replace(/^\/+/, "");

        const supabase = getSupabaseAdmin();
        const found = await findRepo(supabase as any, owner, repoName);
        if (!found) return v1Response({ message: "Not Found" }, 404, rateLimit);

        const repo = found.repo as any;
        const canRead = await hasRepoReadAccess(supabase as any, repo, auth.userId);
        if (!canRead) return v1Response({ message: "Not Found" }, 404, rateLimit);

        // 1. Try finding single file
        const { data: file } = await supabase
          .from("repo_files")
          .select("*")
          .eq("repo_id", repo.id)
          .eq("path", filePath)
          .maybeSingle();

        if (file) {
          const rawContent = file.content || "";
          const base64Content = file.is_binary
            ? rawContent
            : Buffer.from(rawContent).toString("base64");
          const sha = crypto
            .createHash("sha1")
            .update(`blob ${rawContent.length}\0${rawContent}`)
            .digest("hex");

          return v1Response(
            {
              name: filePath.split("/").pop() || filePath,
              path: file.path,
              sha,
              size: file.size || rawContent.length,
              url: `https://gitbowl.dev/api/v1/repos/${owner}/${repoName}/contents/${file.path}`,
              html_url: `https://gitbowl.dev/${owner}/${repoName}/blob/main/${file.path}`,
              git_url: `https://gitbowl.dev/api/v1/repos/${owner}/${repoName}/git/blobs/${sha}`,
              download_url: `https://gitbowl.dev/raw/${owner}/${repoName}/main/${file.path}`,
              type: "file",
              content: base64Content,
              encoding: "base64",
            },
            200,
            rateLimit,
          );
        }

        // 2. Try directory listing
        const dirPrefix = filePath ? `${filePath}/` : "";
        const { data: allFiles } = await supabase
          .from("repo_files")
          .select("path, size, is_binary")
          .eq("repo_id", repo.id);

        const itemsInDir = new Map<string, any>();
        for (const f of allFiles || []) {
          if (!filePath || f.path.startsWith(dirPrefix)) {
            const relPath = filePath ? f.path.slice(dirPrefix.length) : f.path;
            const parts = relPath.split("/");
            const name = parts[0] || "";

            if (parts.length === 1 && name) {
              // file
              itemsInDir.set(name, {
                name,
                path: f.path,
                sha: "0000000000000000000000000000000000000000",
                size: f.size,
                type: "file",
              });
            } else if (name) {
              // directory
              const subDirPath = filePath ? `${filePath}/${name}` : name;
              if (!itemsInDir.has(name)) {
                itemsInDir.set(name, {
                  name,
                  path: subDirPath,
                  sha: "0000000000000000000000000000000000000000",
                  size: 0,
                  type: "dir",
                });
              }
            }
          }
        }

        if (itemsInDir.size > 0 || filePath === "") {
          return v1Response(Array.from(itemsInDir.values()), 200, rateLimit);
        }

        return v1Response({ message: "Not Found" }, 404, rateLimit);
      },

      PUT: async ({ request, params }) => {
        const auth = await authenticateApiV1(request);
        const rateLimit = checkApiV1RateLimit(request, auth.userId);
        if (!rateLimit.allowed) return v1RateLimitExceeded(rateLimit);

        if (!auth.userId) {
          return v1Response({ message: "Requires authentication" }, 401, rateLimit);
        }

        const { owner, repo: repoName, _splat: rawPath } = params;
        const filePath = (rawPath || "").replace(/^\/+/, "");
        if (!filePath) return v1Response({ message: "Path is required" }, 400, rateLimit);

        const supabase = getSupabaseAdmin();
        const found = await findRepo(supabase as any, owner, repoName);
        if (!found) return v1Response({ message: "Not Found" }, 404, rateLimit);

        const repo = found.repo as any;
        const canWrite = await hasRepoWriteAccess(supabase as any, repo, auth.userId);
        if (!canWrite) return v1Response({ message: "Forbidden" }, 403, rateLimit);

        const body = await request.json().catch(() => ({}));
        const message = sanitizeCommitMessage(body.message, `Update ${filePath}`);
        const base64Content = body.content || "";
        const branch = (body.branch || repo.default_branch || "main").trim();

        let rawContent = "";
        let isBinary = isBinaryPath(filePath);
        try {
          const buf = Buffer.from(base64Content, "base64");
          if (buf.includes(0) || isBinary) {
            isBinary = true;
            rawContent = base64Content;
          } else {
            rawContent = sanitizeUnicode(buf.toString("utf8"));
          }
        } catch {
          rawContent = sanitizeUnicode(base64Content);
        }

        // Commit file via commit service
        const commitResult = await createCommit({
          repoId: repo.id,
          authorId: auth.userId,
          branch,
          message,
          files: [{ path: sanitizeFilePath(filePath), content: rawContent, is_binary: isBinary }],
        });

        const sha = crypto
          .createHash("sha1")
          .update(`blob ${rawContent.length}\0${rawContent}`)
          .digest("hex");

        return v1Response(
          {
            content: {
              name: filePath.split("/").pop() || filePath,
              path: filePath,
              sha,
              size: rawContent.length,
              type: "file",
            },
            commit: {
              sha: commitResult.commitId,
              message,
              html_url: `https://gitbowl.dev/${owner}/${repoName}/commit/${commitResult.commitId}`,
            },
          },
          200,
          rateLimit,
        );
      },

      DELETE: async ({ request, params }) => {
        const auth = await authenticateApiV1(request);
        const rateLimit = checkApiV1RateLimit(request, auth.userId);
        if (!rateLimit.allowed) return v1RateLimitExceeded(rateLimit);

        if (!auth.userId) {
          return v1Response({ message: "Requires authentication" }, 401, rateLimit);
        }

        const { owner, repo: repoName, _splat: rawPath } = params;
        const filePath = (rawPath || "").replace(/^\/+/, "");
        if (!filePath) return v1Response({ message: "Path is required" }, 400, rateLimit);

        const supabase = getSupabaseAdmin();
        const found = await findRepo(supabase as any, owner, repoName);
        if (!found) return v1Response({ message: "Not Found" }, 404, rateLimit);

        const repo = found.repo as any;
        const canWrite = await hasRepoWriteAccess(supabase as any, repo, auth.userId);
        if (!canWrite) return v1Response({ message: "Forbidden" }, 403, rateLimit);

        const body = await request.json().catch(() => ({}));
        const message = (body.message || `Delete ${filePath}`).trim();
        const branch = (body.branch || repo.default_branch || "main").trim();

        // Remove from repo_files
        await supabase.from("repo_files").delete().eq("repo_id", repo.id).eq("path", filePath);

        // Record deletion commit
        const { data: newCommit } = await supabase
          .from("commits")
          .insert({
            repo_id: repo.id,
            author_id: auth.userId,
            message,
            changes: [{ path: filePath, type: "deleted" }],
          })
          .select()
          .single();

        return v1Response(
          {
            commit: {
              sha: (newCommit as any)?.id || "0000000000000000000000000000000000000000",
              message,
            },
          },
          200,
          rateLimit,
        );
      },
    },
  },
});
