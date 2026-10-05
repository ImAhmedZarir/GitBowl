// src/routes/api/repo/github-sync.ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getRepoSyncConfig,
  setRepoSyncConfig,
  mirrorToGitHub,
  pullFromGitHub,
} from "@/lib/github-sync.server";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const Route = createFileRoute("/api/repo/github-sync")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const repoId = url.searchParams.get("repoId");
        if (!repoId) return json({ error: "repoId is required" }, 400);

        const config = await getRepoSyncConfig(repoId);
        return json({ config });
      },

      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
        const token = authHeader.slice(7);

        const supabase = getSupabaseAdmin();
        const { data: userData } = await supabase.auth.getUser(token);
        if (!userData?.user) return json({ error: "Unauthorized" }, 401);

        const body = await request.json().catch(() => ({}));
        const { repoId, action = "configure" } = body;
        if (!repoId) return json({ error: "repoId is required" }, 400);

        // Verify repository ownership or write permission
        const { data: repo } = await supabase
          .from("repositories")
          .select("id, owner_id")
          .eq("id", repoId)
          .maybeSingle();

        if (!repo || repo.owner_id !== userData.user.id) {
          return json({ error: "Only repository owner can configure GitHub sync" }, 403);
        }

        if (action === "configure") {
          const {
            githubOwner,
            githubRepo,
            accessToken,
            syncDirection = "mirror_to_github",
            conflictStrategy = "gitbowl_wins",
          } = body;

          if (!githubOwner || !githubRepo) {
            return json({ error: "githubOwner and githubRepo are required" }, 400);
          }

          const saved = await setRepoSyncConfig({
            repo_id: repoId,
            github_owner: githubOwner.trim(),
            github_repo: githubRepo.trim(),
            access_token: accessToken || null,
            sync_direction: syncDirection,
            conflict_strategy: conflictStrategy,
          });

          return json({ success: true, config: saved });
        }

        if (action === "sync_now") {
          const config = await getRepoSyncConfig(repoId);
          if (!config) return json({ error: "Sync not configured" }, 400);

          let res: { success: boolean; error?: string };
          if (config.sync_direction === "pull_from_github") {
            res = await pullFromGitHub(repoId);
          } else {
            res = await mirrorToGitHub(repoId);
          }

          if (!res.success) return json({ error: res.error }, 500);
          return json({ success: true });
        }

        return json({ error: "Invalid action" }, 400);
      },
    },
  },
});
