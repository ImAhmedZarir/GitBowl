// src/routes/api/repo/github-sync.ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { getActor, requireRepoAccess } from "@/lib/authz.server";
import {
  getRepoSyncConfig,
  setRepoSyncConfig,
  mirrorToGitHub,
  pullFromGitHub,
} from "@/lib/github-sync.server";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    },
  });

export const Route = createFileRoute("/api/repo/github-sync")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const actor = await getActor(request);
        if (!actor) return json({ error: "Unauthorized" }, 401);

        const url = new URL(request.url);
        const repoId = url.searchParams.get("repoId");
        if (!repoId) return json({ error: "repoId is required" }, 400);

        const supabase = getSupabaseAdmin();
        const { data: repo } = await supabase
          .from("repositories")
          .select("id, is_private, owner_id, org_id")
          .eq("id", repoId)
          .maybeSingle();

        if (!repo) return json({ error: "Repository not found" }, 404);

        const access = await requireRepoAccess(actor, repo, "admin");
        if (!access.allowed) {
          return json({ error: "Admin access required" }, access.status || 403);
        }

        const rawConfig = await getRepoSyncConfig(repoId);
        if (!rawConfig) {
          return json({ config: null });
        }

        // CRITICAL SECURITY: Never return access_token to the client
        const safeConfig = {
          connected: Boolean(rawConfig.access_token || rawConfig.github_repo),
          githubOwner: rawConfig.github_owner || null,
          githubRepo: rawConfig.github_repo || null,
          syncDirection: rawConfig.sync_direction || "mirror_to_github",
          conflictStrategy: rawConfig.conflict_strategy || "gitbowl_wins",
          status: (rawConfig as any).status || "connected",
          updatedAt: (rawConfig as any).updated_at || null,
        };

        return json({ config: safeConfig });
      },

      POST: async ({ request }) => {
        const actor = await getActor(request);
        if (!actor) return json({ error: "Unauthorized" }, 401);

        const body = await request.json().catch(() => ({}));
        const { repoId, action = "configure" } = body;
        if (!repoId) return json({ error: "repoId is required" }, 400);

        const supabase = getSupabaseAdmin();
        const { data: repo } = await supabase
          .from("repositories")
          .select("id, is_private, owner_id, org_id")
          .eq("id", repoId)
          .maybeSingle();

        if (!repo) return json({ error: "Repository not found" }, 404);

        const access = await requireRepoAccess(actor, repo, "admin");
        if (!access.allowed) {
          return json({ error: "Only repository administrators can configure GitHub sync" }, 403);
        }

        if (action === "configure") {
          const {
            githubOwner,
            githubRepo,
            accessToken,
            syncDirection = "mirror_to_github",
            conflictStrategy = "gitbowl_wins",
          } = body;

          if (!githubOwner || !githubRepo || !accessToken) {
            return json(
              { error: "githubOwner, githubRepo, and accessToken are required to configure" },
              400,
            );
          }

          const config = await setRepoSyncConfig({
            repoId,
            githubOwner,
            githubRepo,
            accessToken,
            syncDirection,
            conflictStrategy,
          });

          return json({ success: true, connected: true });
        }

        if (action === "sync_now" || action === "sync_to_github") {
          const result = await mirrorToGitHub(repoId);
          return json(result, result.success ? 200 : 500);
        }

        if (action === "pull_from_github") {
          const result = await pullFromGitHub(repoId);
          return json(result, result.success ? 200 : 500);
        }

        return json({ error: `Unknown action: ${action}` }, 400);
      },
    },
  },
});
