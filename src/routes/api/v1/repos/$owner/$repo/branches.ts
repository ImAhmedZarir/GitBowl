// src/routes/api/v1/repos/$owner/$repo/branches.ts
// GET /api/v1/repos/:owner/:repo/branches
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { findRepo, hasRepoReadAccess } from "@/lib/git.server";
import {
  authenticateApiV1,
  checkApiV1RateLimit,
  v1Response,
  v1RateLimitExceeded,
} from "@/lib/api-v1.server";

export const Route = createFileRoute("/api/v1/repos/$owner/$repo/branches")({
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

        const repo = found.repo as any;
        // Fetch branches from refs table
        const { data: refs } = await supabase
          .from("refs" as any)
          .select("name, sha")
          .eq("repo_id", repo.id);

        const defaultBranchName = repo.default_branch || "main";
        const branchList: { name: string; sha: string; isProtected: boolean }[] = [];

        // Always include default branch
        branchList.push({
          name: defaultBranchName,
          sha: repo.head_sha || "0000000000000000000000000000000000000000",
          isProtected: true,
        });

        for (const r of (refs || []) as any[]) {
          const cleanName = (r.name || "").replace(/^refs\/heads\//, "");
          if (cleanName && cleanName !== defaultBranchName) {
            branchList.push({
              name: cleanName,
              sha: r.sha,
              isProtected: false,
            });
          }
        }

        const formatted = branchList.map((b) => ({
          name: b.name,
          commit: {
            sha: b.sha,
            url: `https://gitbowl.dev/api/v1/repos/${owner}/${repoName}/commits/${b.sha}`,
          },
          protected: b.isProtected,
        }));

        return v1Response(formatted, 200, rateLimit);
      },
    },
  },
});
