// src/routes/api/v1/repos/$owner/$repo/issues.ts
// GET & POST /api/v1/repos/:owner/:repo/issues
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { findRepo, hasRepoReadAccess } from "@/lib/git.server";
import {
  authenticateApiV1,
  checkApiV1RateLimit,
  v1Response,
  v1RateLimitExceeded,
} from "@/lib/api-v1.server";

export const Route = createFileRoute("/api/v1/repos/$owner/$repo/issues")({
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

        const url = new URL(request.url);
        const stateFilter = url.searchParams.get("state") || "open";

        const repoId = (found.repo as any).id;
        let query = supabase
          .from("issues" as any)
          .select("*, author:author_id(id, username, display_name, avatar_url)")
          .eq("repo_id", repoId)
          .order("created_at", { ascending: false });

        if (stateFilter !== "all") {
          query = query.eq("status", stateFilter);
        }

        const { data: issues, error } = await query;
        if (error) return v1Response({ message: error.message }, 500, rateLimit);

        const formatted = (issues || []).map((issue: any) => ({
          id: issue.id,
          number: issue.number || 1,
          state: issue.status || "open",
          title: issue.title,
          body: issue.description || "",
          user: {
            login: issue.author?.username || "user",
            id: issue.author?.id || "",
            avatar_url:
              issue.author?.avatar_url ||
              `https://avatar.vercel.sh/${issue.author?.username || "user"}`,
          },
          created_at: issue.created_at,
          updated_at: issue.updated_at || issue.created_at,
          closed_at: issue.status === "closed" ? issue.updated_at : null,
          html_url: `https://gitbowl.dev/${owner}/${repoName}/issues/${issue.number || issue.id}`,
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

        const body = await request.json().catch(() => ({}));
        const title = (body.title || "").trim();
        const description = (body.body || body.description || "").trim();

        if (!title) {
          return v1Response(
            { message: "Validation Failed", errors: [{ field: "title", code: "missing_field" }] },
            422,
            rateLimit,
          );
        }

        const repoId = (found.repo as any).id;
        const { data: latestIssue } = await supabase
          .from("issues" as any)
          .select("number")
          .eq("repo_id", repoId)
          .order("number", { ascending: false })
          .limit(1)
          .maybeSingle();

        const issueNumber = ((latestIssue as any)?.number || 0) + 1;

        const { data: newIssue, error: insertError } = await supabase
          .from("issues" as any)
          .insert({
            repo_id: repoId,
            author_id: auth.userId,
            number: issueNumber,
            title,
            description,
            status: "open",
          })
          .select("*, author:author_id(id, username, display_name, avatar_url)")
          .single();

        if (insertError) {
          return v1Response({ message: insertError.message }, 500, rateLimit);
        }

        const formatted = {
          id: (newIssue as any).id,
          number: (newIssue as any).number,
          state: (newIssue as any).status,
          title: (newIssue as any).title,
          body: (newIssue as any).description,
          user: {
            login: auth.username,
            id: auth.userId,
            avatar_url: `https://avatar.vercel.sh/${auth.username}`,
          },
          created_at: (newIssue as any).created_at,
          updated_at: (newIssue as any).updated_at,
          html_url: `https://gitbowl.dev/${owner}/${repoName}/issues/${(newIssue as any).number}`,
        };

        return v1Response(formatted, 201, rateLimit);
      },
    },
  },
});
