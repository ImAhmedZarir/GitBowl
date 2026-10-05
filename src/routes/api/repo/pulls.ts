// src/routes/api/repo/pulls.ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/repo/pulls")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const repoId = url.searchParams.get("repoId");
          const state = url.searchParams.get("state") || "open";

          if (!repoId) {
            return new Response(JSON.stringify({ error: "Missing repoId" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const supabase = getSupabaseAdmin();
          let query = supabase
            .from("pull_requests" as any)
            .select(
              "id, number, title, body, state, source_branch, target_branch, is_draft, created_at, updated_at, merged_at, closed_at, profiles!pull_requests_author_id_fkey(username, display_name)",
            )
            .eq("repo_id", repoId)
            .order("created_at", { ascending: false });

          if (state !== "all") {
            query = query.eq("state", state);
          }

          const { data: prs, error } = await query;
          if (error) throw error;

          return new Response(JSON.stringify({ pullRequests: prs ?? [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: err.message || "Failed to fetch pull requests" }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      },

      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization");
          if (!authHeader) {
            return new Response(JSON.stringify({ error: "Authentication required" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

          const supabase = getSupabaseAdmin();
          const token = authHeader.replace(/^Bearer\s+/i, "").trim();
          const { data: userData, error: authError } = await supabase.auth.getUser(token);
          if (authError || !userData?.user) {
            return new Response(JSON.stringify({ error: "Invalid token" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

          const user = userData.user;
          const body = await request.json().catch(() => ({}));
          const {
            repoId,
            title,
            body: prBody,
            sourceBranch,
            targetBranch = "main",
            sourceRepoId,
          } = body;

          if (!repoId || !title?.trim() || !sourceBranch) {
            return new Response(JSON.stringify({ error: "Missing required fields" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Fetch next PR number
          const { data: latestPr } = await supabase
            .from("pull_requests" as any)
            .select("number")
            .eq("repo_id", repoId)
            .order("number", { ascending: false })
            .limit(1)
            .single();

          const nextNumber = ((latestPr as any)?.number || 0) + 1;

          const { data: newPr, error: insertError } = await supabase
            .from("pull_requests" as any)
            .insert({
              repo_id: repoId,
              number: nextNumber,
              title: title.trim(),
              body: (prBody || "").trim(),
              state: "open",
              source_branch: sourceBranch,
              target_branch: targetBranch,
              source_repo_id: sourceRepoId || repoId,
              author_id: user.id,
            } as any)
            .select("id, number, title, state, created_at")
            .single();

          if (insertError) throw insertError;

          return new Response(JSON.stringify({ pullRequest: newPr }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: err.message || "Failed to create pull request" }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      },
    },
  },
});
