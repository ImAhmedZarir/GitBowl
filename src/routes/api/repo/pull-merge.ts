// src/routes/api/repo/pull-merge.ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { getActor, requireRepoAccess } from "@/lib/authz.server";
import { commitChanges } from "@/lib/commit-service.server";

export const Route = createFileRoute("/api/repo/pull-merge")({
  server: {
    handlers: {
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
          const { prId, method = "squash", commitMessage } = body;

          if (!prId) {
            return new Response(JSON.stringify({ error: "Missing prId" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const supabase = getSupabaseAdmin();

          // 1. Fetch Pull Request details
          const { data: pr, error: prError } = await supabase
            .from("pull_requests" as any)
            .select(
              "id, repo_id, number, title, body, state, source_branch, target_branch, repositories(id, name, is_private, owner_id, org_id, default_branch)",
            )
            .eq("id", prId)
            .maybeSingle();

          if (prError || !pr) {
            return new Response(JSON.stringify({ error: "Pull request not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          if ((pr as any).state === "merged") {
            return new Response(JSON.stringify({ error: "Pull request is already merged" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const repo = (pr as any).repositories;
          const repoId = (pr as any).repo_id;

          // 2. Authorization check: must have write access to repository
          const access = await requireRepoAccess(actor, repo, "write");
          if (!access.allowed) {
            return new Response(
              JSON.stringify({ error: "Forbidden: Only repo maintainers with write permissions can merge pull requests" }),
              {
                status: 403,
                headers: { "Content-Type": "application/json" },
              },
            );
          }

          // 3. Create merge commit
          const finalCommitMsg =
            commitMessage ||
            `Merge pull request #${(pr as any).number} from ${(pr as any).source_branch}\n\n${(pr as any).title}`;

          const commitResult = await commitChanges({
            repoId,
            authHeader: request.headers.get("authorization") || "",
            message: finalCommitMsg,
            branch: (pr as any).target_branch || "main",
          });

          // 4. Update PR state to merged
          await supabase
            .from("pull_requests" as any)
            .update({
              state: "merged",
              merged_at: new Date().toISOString(),
              merge_commit_sha: commitResult.commitSha,
            } as any)
            .eq("id", prId);

          // 5. Auto-close linked issues (e.g. "fixes #12", "closes #5")
          const fullText = `${(pr as any).title} ${(pr as any).body}`;
          const issueMatchRegex = /(?:fixes|closes|resolves)\s+#(\d+)/gi;
          let match: RegExpExecArray | null;
          const closedIssueNumbers: number[] = [];

          while ((match = issueMatchRegex.exec(fullText)) !== null) {
            const numStr = match[1];
            if (numStr) {
              const issueNum = parseInt(numStr, 10);
              if (!isNaN(issueNum)) {
                closedIssueNumbers.push(issueNum);
              }
            }
          }

          if (closedIssueNumbers.length > 0) {
            for (const issueNum of closedIssueNumbers) {
              await supabase
                .from("issues")
                .update({ state: "closed" })
                .eq("repo_id", repoId)
                .eq("number", issueNum);

              // Add a comment to the closed issue
              const { data: issueRow } = await supabase
                .from("issues")
                .select("id")
                .eq("repo_id", repoId)
                .eq("number", issueNum)
                .maybeSingle();

              if (issueRow) {
                await supabase.from("issue_comments").insert({
                  issue_id: issueRow.id,
                  author_id: actor.userId,
                  body: `Closed by pull request #${(pr as any).number} (${commitResult.commitSha.slice(0, 7)}).`,
                });
              }
            }
          }

          return new Response(
            JSON.stringify({
              success: true,
              mergeCommitSha: commitResult.commitSha,
              closedIssues: closedIssueNumbers,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: err.message || "Failed to merge pull request" }),
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
