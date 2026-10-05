// src/routes/api/admin/overview.ts
import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin, recordAuditLog } from "@/lib/admin.server";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/admin/overview")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const admin = await requireAdmin(request);
          const supabase = getSupabaseAdmin();

          // 1. Users metrics
          const { count: totalUsers } = await supabase
            .from("profiles")
            .select("*", { count: "exact", head: true });

          // 2. Repositories metrics
          const { count: totalRepos } = await supabase
            .from("repositories")
            .select("*", { count: "exact", head: true });

          const { count: publicRepos } = await supabase
            .from("repositories")
            .select("*", { count: "exact", head: true })
            .eq("is_private", false);

          const { count: privateRepos } = await supabase
            .from("repositories")
            .select("*", { count: "exact", head: true })
            .eq("is_private", true);

          // 3. Commits & activity
          const { count: totalCommits } = await supabase
            .from("commits")
            .select("*", { count: "exact", head: true });

          // 4. Backups queue status
          const { count: pendingBackups } = await supabase
            .from("storage_backups" as any)
            .select("*", { count: "exact", head: true })
            .eq("status", "pending");

          const { count: failedBackups } = await supabase
            .from("storage_backups" as any)
            .select("*", { count: "exact", head: true })
            .eq("status", "failed");

          const { count: completedBackups } = await supabase
            .from("storage_backups" as any)
            .select("*", { count: "exact", head: true })
            .eq("status", "done");

          // 5. Pull requests
          const { count: totalPrs } = await supabase
            .from("pull_requests" as any)
            .select("*", { count: "exact", head: true });

          // 6. Issues
          const { count: totalIssues } = await supabase
            .from("issues")
            .select("*", { count: "exact", head: true });

          // 7. Recent top repositories
          let topRepos: any[] = [];
          const { data: reposData, error: repoErr } = await supabase
            .from("repositories")
            .select("id, name, stars_count, forks_count, is_private, owner_id")
            .order("stars_count", { ascending: false })
            .limit(5);

          if (!repoErr && reposData) {
            const ownerIds = [...new Set(reposData.map((r) => r.owner_id))];
            const { data: owners } = await supabase
              .from("profiles")
              .select("id, username")
              .in("id", ownerIds);
            const ownerMap = new Map((owners || []).map((o: any) => [o.id, o.username]));

            topRepos = reposData.map((r) => ({
              ...r,
              profiles: { username: ownerMap.get(r.owner_id) || "unknown" },
            }));
          }

          // Record access in audit log
          await recordAuditLog({
            actorId: admin.id,
            action: "admin.view_overview",
            targetType: "system",
            ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
          });

          return new Response(
            JSON.stringify({
              metrics: {
                users: totalUsers ?? 0,
                repositories: totalRepos ?? 0,
                publicRepos: publicRepos ?? 0,
                privateRepos: privateRepos ?? 0,
                commits: totalCommits ?? 0,
                pullRequests: totalPrs ?? 0,
                issues: totalIssues ?? 0,
                queue: {
                  pending: pendingBackups ?? 0,
                  failed: failedBackups ?? 0,
                  completed: completedBackups ?? 0,
                },
              },
              topRepos: topRepos ?? [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (err: any) {
          if (err instanceof Response) return err;
          return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
