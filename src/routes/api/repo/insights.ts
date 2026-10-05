// src/routes/api/repo/insights.ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { hasRepoReadAccess } from "@/lib/git.server";
import { createHash } from "crypto";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/repo/insights")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const repoId = url.searchParams.get("repoId");

          // 1. Validate repoId as a strict UUID
          if (!repoId || !UUID_REGEX.test(repoId)) {
            return new Response(JSON.stringify({ error: "Repository not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          const supabase = getSupabaseAdmin();

          // 2. Fetch repository metadata to check access
          const { data: repo, error: repoError } = await supabase
            .from("repositories")
            .select("id, name, is_private, owner_id, org_id")
            .eq("id", repoId)
            .maybeSingle();

          if (repoError || !repo) {
            return new Response(JSON.stringify({ error: "Repository not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          // 3. If repo is private, authenticate and require read access
          if (repo.is_private) {
            let userId: string | null = null;
            const authHeader = request.headers.get("authorization");

            if (authHeader?.toLowerCase().startsWith("bearer ")) {
              const token = authHeader.slice(7).trim();
              if (token.startsWith("gbp_")) {
                const hash = createHash("sha256").update(token).digest("hex");
                const { data: pat } = await supabase
                  .from("personal_access_tokens")
                  .select("user_id, expires_at")
                  .eq("token_hash", hash)
                  .maybeSingle();
                if (pat && (!pat.expires_at || new Date(pat.expires_at) > new Date())) {
                  userId = pat.user_id;
                }
              } else {
                const { data: userData } = await supabase.auth.getUser(token);
                if (userData?.user) {
                  userId = userData.user.id;
                }
              }
            }

            const canRead = await hasRepoReadAccess(supabase, repo, userId);
            if (!canRead) {
              return new Response(JSON.stringify({ error: "Repository not found" }), {
                status: 404,
                headers: { "Content-Type": "application/json" },
              });
            }
          }

          // 4. Fetch commits for the repository
          const { data: commits, error } = await supabase
            .from("commits")
            .select(
              "id, author_id, created_at, profiles!commits_author_id_fkey(username, display_name)",
            )
            .eq("repo_id", repoId)
            .order("created_at", { ascending: false });

          if (error) {
            return new Response(JSON.stringify({ error: "Repository not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          // 5. Aggregate contributor statistics
          const contributorMap: Record<
            string,
            { username: string; commitsCount: number; lastCommit: string }
          > = {};

          // 6. Punchcard (7 days x 24 hours)
          const punchcard: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));

          // 7. Commits per month
          const monthlyActivity: Record<string, number> = {};

          for (const c of commits || []) {
            const author = (c as any).profiles?.username || "developer";
            if (!contributorMap[author]) {
              contributorMap[author] = {
                username: author,
                commitsCount: 0,
                lastCommit: c.created_at,
              };
            }
            contributorMap[author].commitsCount++;

            if (c.created_at) {
              const d = new Date(c.created_at);
              const day = d.getDay();
              const hour = d.getHours();
              if (punchcard[day]) {
                punchcard[day][hour] = (punchcard[day][hour] || 0) + 1;
              }

              const monthKey = c.created_at.slice(0, 7); // YYYY-MM
              monthlyActivity[monthKey] = (monthlyActivity[monthKey] || 0) + 1;
            }
          }

          const contributors = Object.values(contributorMap).sort(
            (a, b) => b.commitsCount - a.commitsCount,
          );

          return new Response(
            JSON.stringify({
              totalCommits: commits?.length || 0,
              contributors,
              punchcard,
              monthlyActivity,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch {
          return new Response(JSON.stringify({ error: "Repository not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
