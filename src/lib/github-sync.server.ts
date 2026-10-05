// src/lib/github-sync.server.ts
// Bi-directional GitHub Sync Engine
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { createCommit } from "@/lib/commit-service.server";

export interface GitHubSyncConfig {
  id?: string;
  repo_id: string;
  github_owner: string;
  github_repo: string;
  access_token?: string | null;
  sync_direction: "mirror_to_github" | "pull_from_github" | "bidirectional";
  conflict_strategy: "gitbowl_wins" | "github_wins";
  last_synced_at?: string | null;
  sync_status: "synced" | "syncing" | "error";
  last_error?: string | null;
  webhook_id?: string | null;
}

export async function getRepoSyncConfig(repoId: string): Promise<GitHubSyncConfig | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("repo_github_sync" as any)
    .select("*")
    .eq("repo_id", repoId)
    .maybeSingle();

  return (data as unknown as GitHubSyncConfig) ?? null;
}

export async function setRepoSyncConfig(
  config: Partial<GitHubSyncConfig> & {
    repo_id: string;
    github_owner: string;
    github_repo: string;
  },
): Promise<GitHubSyncConfig> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("repo_github_sync" as any)
    .upsert(
      {
        repo_id: config.repo_id,
        github_owner: config.github_owner,
        github_repo: config.github_repo,
        access_token: config.access_token || null,
        sync_direction: config.sync_direction || "mirror_to_github",
        conflict_strategy: config.conflict_strategy || "gitbowl_wins",
        sync_status: "synced",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "repo_id" },
    )
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as GitHubSyncConfig;
}

/**
 * Mirror local GitBowl repository to GitHub
 */
export async function mirrorToGitHub(
  repoId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();
  const config = await getRepoSyncConfig(repoId);
  if (!config) return { success: false, error: "GitHub sync not configured for this repo" };

  try {
    await supabase
      .from("repo_github_sync" as any)
      .update({ sync_status: "syncing", last_error: null })
      .eq("repo_id", repoId);

    // If access token is provided, push files to GitHub via GitHub API
    const token = config.access_token;
    if (token) {
      // 1. Fetch repo files from GitBowl
      const { data: files } = await supabase
        .from("repo_files")
        .select("path, content, is_binary")
        .eq("repo_id", repoId);

      // 2. Push / update files on GitHub repository
      // GitHub API commit/trees or Contents API
      for (const file of files || []) {
        if (file.is_binary) continue;
        const encoded = Buffer.from(file.content || "").toString("base64");
        const ghUrl = `https://api.github.com/repos/${config.github_owner}/${config.github_repo}/contents/${file.path}`;

        // Check if file exists on GitHub to provide sha
        const getRes = await fetch(ghUrl, {
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "GitBowl-Sync",
          },
        });

        let sha: string | undefined = undefined;
        if (getRes.ok) {
          const getJson = await getRes.json();
          sha = getJson.sha;
        }

        await fetch(ghUrl, {
          method: "PUT",
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
            "User-Agent": "GitBowl-Sync",
          },
          body: JSON.stringify({
            message: `GitBowl sync: update ${file.path}`,
            content: encoded,
            sha,
          }),
        }).catch((err) => console.warn("[GHSync] File put error:", err));
      }
    }

    await supabase
      .from("repo_github_sync" as any)
      .update({
        sync_status: "synced",
        last_synced_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("repo_id", repoId);

    return { success: true };
  } catch (err: any) {
    const errorMsg = err.message || "Unknown error mirroring to GitHub";
    await supabase
      .from("repo_github_sync" as any)
      .update({ sync_status: "error", last_error: errorMsg })
      .eq("repo_id", repoId);

    return { success: false, error: errorMsg };
  }
}

/**
 * Pull changes from GitHub into GitBowl repository
 */
export async function pullFromGitHub(
  repoId: string,
  commitMessage = "Sync changes from GitHub",
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();
  const config = await getRepoSyncConfig(repoId);
  if (!config) return { success: false, error: "GitHub sync not configured" };

  try {
    await supabase
      .from("repo_github_sync" as any)
      .update({ sync_status: "syncing", last_error: null })
      .eq("repo_id", repoId);

    // Fetch repository metadata and owner from GitBowl
    const { data: repo } = await supabase
      .from("repositories")
      .select("*, profiles!repositories_owner_id_fkey(id, username)")
      .eq("id", repoId)
      .single();

    if (!repo) throw new Error("Repository not found");

    const token = config.access_token;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "GitBowl-Sync",
    };
    if (token) headers["Authorization"] = `token ${token}`;

    // Get default branch commit from GitHub
    const repoInfoRes = await fetch(
      `https://api.github.com/repos/${config.github_owner}/${config.github_repo}`,
      { headers },
    );

    if (!repoInfoRes.ok) {
      throw new Error(`GitHub repository ${config.github_owner}/${config.github_repo} unreachable`);
    }

    const repoInfo = await repoInfoRes.json();
    const defaultBranch = repoInfo.default_branch || "main";

    // Fetch git tree recursively
    const treeRes = await fetch(
      `https://api.github.com/repos/${config.github_owner}/${config.github_repo}/git/trees/${defaultBranch}?recursive=1`,
      { headers },
    );

    if (!treeRes.ok) throw new Error("Could not fetch repository tree from GitHub");
    const treeData = await treeRes.json();
    const filesToSync: { path: string; content: string; is_binary: boolean }[] = [];

    for (const item of (treeData.tree || []).slice(0, 50)) {
      if (item.type === "blob") {
        const blobRes = await fetch(item.url, { headers });
        if (blobRes.ok) {
          const blobData = await blobRes.json();
          const content = Buffer.from(blobData.content || "", "base64").toString("utf8");
          filesToSync.push({
            path: item.path,
            content,
            is_binary: false,
          });
        }
      }
    }

    if (filesToSync.length > 0) {
      await createCommit({
        repoId,
        authorId: repo.owner_id,
        branch: repo.default_branch || "main",
        message: commitMessage,
        files: filesToSync,
      });
    }

    await supabase
      .from("repo_github_sync" as any)
      .update({
        sync_status: "synced",
        last_synced_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("repo_id", repoId);

    return { success: true };
  } catch (err: any) {
    const errorMsg = err.message || "Failed to pull from GitHub";
    await supabase
      .from("repo_github_sync" as any)
      .update({ sync_status: "error", last_error: errorMsg })
      .eq("repo_id", repoId);

    return { success: false, error: errorMsg };
  }
}
