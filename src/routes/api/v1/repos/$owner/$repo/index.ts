// src/routes/api/v1/repos/$owner/$repo/index.ts
// GET, PATCH, DELETE /api/v1/repos/:owner/:repo
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { findRepo, hasRepoWriteAccess, hasRepoReadAccess } from "@/lib/git.server";
import {
  authenticateApiV1,
  checkApiV1RateLimit,
  v1Response,
  v1RateLimitExceeded,
  formatGitHubRepo,
} from "@/lib/api-v1.server";

export const Route = createFileRoute("/api/v1/repos/$owner/$repo/")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await authenticateApiV1(request);
        const rateLimit = checkApiV1RateLimit(request, auth.userId);
        if (!rateLimit.allowed) return v1RateLimitExceeded(rateLimit);

        const { owner, repo: repoName } = params;
        const supabase = getSupabaseAdmin();
        const found = await findRepo(supabase as any, owner, repoName);

        if (!found) {
          return v1Response({ message: "Not Found" }, 404, rateLimit);
        }

        const canRead = await hasRepoReadAccess(supabase as any, found.repo, auth.userId);
        if (!canRead) {
          return v1Response({ message: "Not Found" }, 404, rateLimit);
        }

        return v1Response(formatGitHubRepo(found.repo, found.owner.username), 200, rateLimit);
      },

      PATCH: async ({ request, params }) => {
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

        const canWrite = await hasRepoWriteAccess(supabase as any, found.repo, auth.userId);
        if (!canWrite) return v1Response({ message: "Forbidden" }, 403, rateLimit);

        const body = await request.json().catch(() => ({}));
        const updates: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };

        if (typeof body.description === "string") {
          updates["description"] = body.description.trim() || null;
        }
        if (typeof body.private === "boolean") {
          updates["is_private"] = body.private;
        }
        if (typeof body.default_branch === "string" && body.default_branch.trim()) {
          updates["default_branch"] = body.default_branch.trim();
        }

        const { data: updated, error } = await supabase
          .from("repositories" as any)
          .update(updates)
          .eq("id", (found.repo as any).id)
          .select()
          .single();

        if (error) return v1Response({ message: error.message }, 500, rateLimit);

        return v1Response(formatGitHubRepo(updated, found.owner.username), 200, rateLimit);
      },

      DELETE: async ({ request, params }) => {
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

        // Only owner can delete
        const repo = found.repo as any;
        if (repo.owner_id !== auth.userId) {
          return v1Response({ message: "Forbidden" }, 403, rateLimit);
        }

        await supabase
          .from("repositories" as any)
          .delete()
          .eq("id", repo.id);
        return new Response(null, { status: 204 });
      },
    },
  },
});
