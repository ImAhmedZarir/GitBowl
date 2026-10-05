// src/routes/api/v1/repos/$owner/$repo/commits.ts
// GET /api/v1/repos/:owner/:repo/commits
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { findRepo, hasRepoReadAccess } from "@/lib/git.server";
import {
  authenticateApiV1,
  checkApiV1RateLimit,
  v1Response,
  v1RateLimitExceeded,
} from "@/lib/api-v1.server";

export const Route = createFileRoute("/api/v1/repos/$owner/$repo/commits")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await authenticateApiV1(request);
        const rateLimit = checkApiV1RateLimit(request, auth.userId);
        if (!rateLimit.allowed) return v1RateLimitExceeded(rateLimit);

        const { owner, repo: repoName } = params;
        const supabase = getSupabaseAdmin();
        const found = await findRepo(supabase as any, owner, repoName);
        if (!found) return v1Response({ message: "Not Found" }, 404, rateLimit);

        const canRead = await hasRepoReadAccess(supabase as any, found.repo, auth.userId);
        if (!canRead) return v1Response({ message: "Not Found" }, 404, rateLimit);

        const repoId = (found.repo as any).id;
        const { data: commits } = await supabase
          .from("commits")
          .select(
            "id, message, created_at, author:author_id(id, username, display_name, avatar_url)",
          )
          .eq("repo_id", repoId)
          .order("created_at", { ascending: false })
          .limit(30);

        const formatted = (commits || []).map((c: any) => {
          const authorUser = c.author || {
            username: found.owner.username,
            display_name: found.owner.username,
          };
          return {
            sha: c.id,
            node_id: Buffer.from(`commit:${c.id}`).toString("base64"),
            commit: {
              author: {
                name: authorUser.display_name || authorUser.username,
                email: `${authorUser.username}@gitbowl.dev`,
                date: c.created_at,
              },
              committer: {
                name: authorUser.display_name || authorUser.username,
                email: `${authorUser.username}@gitbowl.dev`,
                date: c.created_at,
              },
              message: c.message,
              tree: {
                sha: c.id,
                url: `https://gitbowl.dev/api/v1/repos/${owner}/${repoName}/git/trees/${c.id}`,
              },
              url: `https://gitbowl.dev/api/v1/repos/${owner}/${repoName}/commits/${c.id}`,
              comment_count: 0,
            },
            url: `https://gitbowl.dev/api/v1/repos/${owner}/${repoName}/commits/${c.id}`,
            html_url: `https://gitbowl.dev/${owner}/${repoName}/commit/${c.id}`,
            author: {
              login: authorUser.username,
              id: authorUser.id || 0,
              avatar_url:
                authorUser.avatar_url || `https://avatar.vercel.sh/${authorUser.username}`,
              html_url: `https://gitbowl.dev/${authorUser.username}`,
            },
          };
        });

        return v1Response(formatted, 200, rateLimit);
      },
    },
  },
});
