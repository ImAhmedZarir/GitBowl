// src/routes/api/v1/user/repos.ts
// GET & POST /api/v1/user/repos
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import {
  authenticateApiV1,
  checkApiV1RateLimit,
  v1Response,
  v1RateLimitExceeded,
  formatGitHubRepo,
} from "@/lib/api-v1.server";

export const Route = createFileRoute("/api/v1/user/repos")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiV1(request);
        const rateLimit = checkApiV1RateLimit(request, auth.userId);
        if (!rateLimit.allowed) return v1RateLimitExceeded(rateLimit);

        if (!auth.userId) {
          return v1Response(
            {
              message: "Requires authentication",
              documentation_url: "https://gitbowl.dev/api/docs",
            },
            401,
            rateLimit,
          );
        }

        const supabase = getSupabaseAdmin();
        const { data: repos, error } = await supabase
          .from("repositories" as any)
          .select("*, profiles!repositories_owner_id_fkey(username)")
          .eq("owner_id", auth.userId)
          .order("updated_at", { ascending: false });

        if (error) {
          return v1Response({ message: error.message }, 500, rateLimit);
        }

        const formatted = (repos || []).map((r: any) =>
          formatGitHubRepo(r, r.profiles?.username || auth.username || "user"),
        );
        return v1Response(formatted, 200, rateLimit);
      },

      POST: async ({ request }) => {
        const auth = await authenticateApiV1(request);
        const rateLimit = checkApiV1RateLimit(request, auth.userId);
        if (!rateLimit.allowed) return v1RateLimitExceeded(rateLimit);

        if (!auth.userId || !auth.username) {
          return v1Response(
            {
              message: "Requires authentication",
              documentation_url: "https://gitbowl.dev/api/docs",
            },
            401,
            rateLimit,
          );
        }

        const body = await request.json().catch(() => ({}));
        const rawName = (body.name || "").trim();
        const name = rawName.replace(/[^a-zA-Z0-9._-]/g, "-");
        const description = (body.description || "").trim() || null;
        const isPrivate = body.private === true || body.is_private === true;

        if (!name) {
          return v1Response(
            { message: "Validation Failed", errors: [{ field: "name", code: "missing_field" }] },
            422,
            rateLimit,
          );
        }

        const supabase = getSupabaseAdmin();

        // Check duplicate name
        const { data: existing } = await supabase
          .from("repositories" as any)
          .select("id")
          .eq("owner_id", auth.userId)
          .eq("name", name)
          .maybeSingle();

        if (existing) {
          return v1Response(
            {
              message: "Validation Failed",
              errors: [
                { field: "name", code: "already_exists", message: "Repository already exists" },
              ],
            },
            422,
            rateLimit,
          );
        }

        const { data: newRepo, error: createError } = await supabase
          .from("repositories" as any)
          .insert({
            owner_id: auth.userId,
            name,
            description,
            is_private: isPrivate,
            default_branch: "main",
          })
          .select()
          .single();

        if (createError || !newRepo) {
          return v1Response(
            { message: createError?.message || "Could not create repository" },
            500,
            rateLimit,
          );
        }

        // Initialize default empty commit
        await supabase.from("commits").insert({
          repo_id: (newRepo as any).id,
          author_id: auth.userId,
          message: "Initial commit",
          changes: [],
        });

        return v1Response(formatGitHubRepo(newRepo, auth.username), 201, rateLimit);
      },
    },
  },
});
