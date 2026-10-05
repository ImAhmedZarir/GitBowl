// src/routes/api/v1/repos/$owner/$repo/pulls.ts
// GET & POST /api/v1/repos/:owner/:repo/pulls
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { findRepo, hasRepoReadAccess, hasRepoWriteAccess } from "@/lib/git.server";
import {
  authenticateApiV1,
  checkApiV1RateLimit,
  v1Response,
  v1RateLimitExceeded,
} from "@/lib/api-v1.server";

export const Route = createFileRoute("/api/v1/repos/$owner/$repo/pulls")({
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
        const url = new URL(request.url);
        const stateFilter = url.searchParams.get("state") || "open";

        let query = supabase
          .from("pull_requests" as any)
          .select("*, author:author_id(id, username, display_name, avatar_url)")
          .eq("repo_id", repo.id)
          .order("created_at", { ascending: false });

        if (stateFilter !== "all") {
          query = query.eq("status", stateFilter);
        }

        const { data: prs, error } = await query;
        if (error) return v1Response({ message: error.message }, 500, rateLimit);

        const formatted = (prs || []).map((pr: any) => ({
          id: pr.id,
          number: pr.number || 1,
          state: pr.status || "open",
          title: pr.title,
          body: pr.description || "",
          user: {
            login: pr.author?.username || "user",
            id: pr.author?.id || "",
            avatar_url:
              pr.author?.avatar_url || `https://avatar.vercel.sh/${pr.author?.username || "user"}`,
          },
          created_at: pr.created_at,
          updated_at: pr.updated_at || pr.created_at,
          closed_at: pr.status === "closed" || pr.status === "merged" ? pr.updated_at : null,
          merged_at: pr.status === "merged" ? pr.updated_at : null,
          head: {
            ref: pr.source_branch,
            label: pr.source_branch,
          },
          base: {
            ref: pr.target_branch,
            label: pr.target_branch,
          },
          html_url: `https://gitbowl.dev/${owner}/${repoName}/pull/${pr.number || pr.id}`,
        }));

        return v1Response(formatted, 200, rateLimit);
      },

      POST: async ({ request, params }) => {
        const auth = await authenticateApiV1(request);
        const rateLimit = checkApiV1RateLimit(request, auth.userId);
        if (!rateLimit.allowed) return v1RateLimitExceeded(rateLimit);

        if (!auth.userId) {
          return v1Response({ message: "Requires authentication" }, 401, rateLimit);
        }

        const { owner, repo: repoName } = params;
        const supabase = getSupabaseAdmin();
        const found = await findRepo(supabase as any, owner, repoName);
        if (!found) return v1Response({ message: "Not Found" }, 404, rateLimit);

        const repo = found.repo as any;
        const body = await request.json().catch(() => ({}));
        const title = (body.title || "").trim();
        const description = (body.body || body.description || "").trim();
        const base = (body.base || repo.default_branch || "main").trim();
        const head = (body.head || "").trim();

        if (!title || !head) {
          return v1Response(
            {
              message: "Validation Failed",
              errors: [
                { field: "title", code: "missing_field" },
                { field: "head", code: "missing_field" },
              ],
            },
            422,
            rateLimit,
          );
        }

        // Get max number
        const { data: latestPr } = await supabase
          .from("pull_requests" as any)
          .select("number")
          .eq("repo_id", repo.id)
          .order("number", { ascending: false })
          .limit(1)
          .maybeSingle();

        const prNumber = ((latestPr as any)?.number || 0) + 1;

        const { data: newPr, error: insertError } = await supabase
          .from("pull_requests" as any)
          .insert({
            repo_id: repo.id,
            author_id: auth.userId,
            number: prNumber,
            title,
            description,
            source_branch: head,
            target_branch: base,
            status: "open",
          })
          .select("*, author:author_id(id, username, display_name, avatar_url)")
          .single();

        if (insertError) {
          return v1Response({ message: insertError.message }, 500, rateLimit);
        }

        const formatted = {
          id: (newPr as any).id,
          number: (newPr as any).number,
          state: (newPr as any).status,
          title: (newPr as any).title,
          body: (newPr as any).description,
          user: {
            login: auth.username,
            id: auth.userId,
            avatar_url: `https://avatar.vercel.sh/${auth.username}`,
          },
          created_at: (newPr as any).created_at,
          updated_at: (newPr as any).updated_at,
          head: { ref: (newPr as any).source_branch },
          base: { ref: (newPr as any).target_branch },
          html_url: `https://gitbowl.dev/${owner}/${repoName}/pull/${(newPr as any).number}`,
        };

        return v1Response(formatted, 201, rateLimit);
      },
    },
  },
});
