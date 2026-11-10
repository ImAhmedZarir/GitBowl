// src/routes/api/repo/pulls.ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { getActor, requireRepoAccess } from "@/lib/authz.server";

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
          const { data: repo, error: repoErr } = await supabase
            .from("repositories")
            .select("id, is_private, owner_id, org_id")
            .eq("id", repoId)
            .maybeSingle();

          if (repoErr || !repo) {
            return new Response(JSON.stringify({ error: "Repository not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          const actor = await getActor(request);
          const access = await requireRepoAccess(actor, repo, "read");
          if (!access.allowed) {
            return new Response(JSON.stringify({ error: "Access denied" }), {
              status: access.status || 404,
              headers: { "Content-Type": "application/json" },
            });
          }

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

          const isPrivate = Boolean(repo.is_private);
          return new Response(JSON.stringify({ pullRequests: prs ?? [] }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": isPrivate ? "private, no-store" : "public, max-age=30",
            },
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
          const actor = await getActor(request);
          if (!actor) {
            return new Response(JSON.stringify({ error: "Authentication required" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

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

          const supabase = getSupabaseAdmin();
          const { data: repo, error: repoErr } = await supabase
            .from("repositories")
            .select("id, is_private, owner_id, org_id")
            .eq("id", repoId)
            .maybeSingle();

          if (repoErr || !repo) {
            return new Response(JSON.stringify({ error: "Repository not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Must have read access to target repository
          const targetAccess = await requireRepoAccess(actor, repo, "read");
          if (!targetAccess.allowed) {
            return new Response(JSON.stringify({ error: "Target repository not found or access denied" }), {
              status: targetAccess.status || 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          // If source repository is specified and different, check read access on source repository
          if (sourceRepoId && sourceRepoId !== repoId) {
            const { data: sourceRepo } = await supabase
              .from("repositories")
              .select("id, is_private, owner_id, org_id")
              .eq("id", sourceRepoId)
              .maybeSingle();

            if (sourceRepo) {
              const srcAccess = await requireRepoAccess(actor, sourceRepo, "read");
              if (!srcAccess.allowed) {
                return new Response(JSON.stringify({ error: "Source repository access denied" }), {
                  status: srcAccess.status || 404,
                  headers: { "Content-Type": "application/json" },
                });
              }
            }
          }

          // Fetch next PR number atomically
          const { data: latestPr } = await supabase
            .from("pull_requests" as any)
            .select("number")
            .eq("repo_id", repoId)
            .order("number", { ascending: false })
            .limit(1)
            .maybeSingle();

          const nextNumber = ((latestPr as any)?.number || 0) + 1;

          const { data: newPr, error: insertError } = await supabase
            .from("pull_requests" as any)
            .insert({
              repo_id: repoId,
              number: nextNumber,
              title: title.trim(),
              body: (prBody || "").trim(),
              state: "open",
              source_branch: sourceBranch.trim(),
              target_branch: (targetBranch || "main").trim(),
              source_repo_id: sourceRepoId || repoId,
              author_id: actor.userId,
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
