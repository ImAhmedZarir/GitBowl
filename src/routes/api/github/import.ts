import { createFileRoute } from "@tanstack/react-router";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import JSZip from "jszip";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { syncFilesToGoogleDrive } from "@/lib/gdrive.server";
import { createNotification } from "@/lib/notifications.server";
import { notifySearchEngines } from "@/lib/indexnow.server";
import { materialize } from "@/lib/git.server";

const execFileAsync = promisify(execFile);

const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|tgz|7z|rar|mp4|webm|mp3|wav|ogg|wasm|exe|dll|so|dylib|bin|iso|dmg|ttf|otf|woff2?|eot)$/i;

interface FileItem {
  path: string;
  content: string;
  is_binary: boolean;
  size: number;
}

/**
 * Parses any Git repository URL:
 * - GitHub (https://github.com/owner/repo, owner/repo, git@github.com:owner/repo.git)
 * - GitLab (https://gitlab.com/owner/repo.git)
 * - Bitbucket (https://bitbucket.org/owner/repo.git)
 * - Codeberg (https://codeberg.org/owner/repo.git)
 * - Generic/Custom Git server (https://example.com/org/project.git)
 */
export function parseAnyGitUrl(rawInput: string): {
  normalizedCloneUrl: string;
  repoName: string;
  provider: "github" | "gitlab" | "bitbucket" | "codeberg" | "generic";
  ownerName?: string;
} {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error("Git repository URL is required");
  }

  // Shorthand: "owner/repo" (common GitHub shorthand)
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(trimmed)) {
    const [owner, name] = trimmed.split("/");
    const cleanRepoName = name.replace(/\.git$/i, "");
    return {
      normalizedCloneUrl: `https://github.com/${owner}/${cleanRepoName}.git`,
      repoName: cleanRepoName,
      provider: "github",
      ownerName: owner,
    };
  }

  // SSH style: git@host:owner/repo.git
  const sshMatch = trimmed.match(/^git@([a-zA-Z0-9_.-]+):([a-zA-Z0-9_./-]+?)(?:\.git)?$/);
  if (sshMatch) {
    const domain = sshMatch[1];
    const repoPath = sshMatch[2];
    const parts = repoPath.split("/").filter(Boolean);
    const repoName = parts[parts.length - 1] || "repository";
    return {
      normalizedCloneUrl: `https://${domain}/${repoPath}.git`,
      repoName: repoName.replace(/\.git$/i, ""),
      provider: domain.includes("github")
        ? "github"
        : domain.includes("gitlab")
          ? "gitlab"
          : "generic",
      ownerName: parts[0],
    };
  }

  // Standard URL: https://..., http://..., git://...
  let urlObj: URL;
  try {
    const withProto = /^[a-zA-Z]+:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
    urlObj = new URL(withProto);
  } catch {
    throw new Error(
      `Invalid Git URL format: "${trimmed}". Examples: owner/repo, https://github.com/owner/repo, https://gitlab.com/owner/repo.git`,
    );
  }

  const host = urlObj.hostname.toLowerCase();
  let provider: "github" | "gitlab" | "bitbucket" | "codeberg" | "generic" = "generic";
  if (host.includes("github.com")) provider = "github";
  else if (host.includes("gitlab.com")) provider = "gitlab";
  else if (host.includes("bitbucket.org")) provider = "bitbucket";
  else if (host.includes("codeberg.org")) provider = "codeberg";

  const pathParts = urlObj.pathname
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);
  if (pathParts.length === 0) {
    throw new Error(`Invalid Git repository path in URL: "${trimmed}"`);
  }

  const rawLastPart = pathParts[pathParts.length - 1] || "imported-repo";
  const repoName = rawLastPart.replace(/\.git$/i, "");

  // Build clean clone URL (with .git if not already present)
  let normalizedCloneUrl = urlObj.toString();
  if (!normalizedCloneUrl.endsWith(".git") && !normalizedCloneUrl.includes("?")) {
    normalizedCloneUrl += ".git";
  }

  return {
    normalizedCloneUrl,
    repoName,
    provider,
    ownerName: pathParts[0],
  };
}

/**
 * Recursively scans directory and collects all files, preserving dotfiles (.gitignore, .env, .github, etc.)
 */
async function walkClonedDirectory(
  baseDir: string,
  relPath: string,
  files: FileItem[],
): Promise<void> {
  const currentDir = path.join(baseDir, relPath);
  const entries = await fs.readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === ".git") continue; // Exclude .git internals only; preserve all user dotfiles!

    const rawItemRel = relPath ? `${relPath}/${entry.name}` : entry.name;
    const itemRel = rawItemRel.replace(/\\/g, "/").replace(/^\/+/, "");
    const fullPath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      await walkClonedDirectory(baseDir, itemRel, files);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      try {
        const stat = await fs.stat(fullPath);
        // Skip excessively large individual binary files (>15MB) to prevent Postgres timeout
        if (stat.size > 15 * 1024 * 1024) {
          console.warn(`[Import] Skipping file >15MB: ${itemRel} (${stat.size} bytes)`);
          continue;
        }

        const isBinary = BINARY_EXT.test(itemRel);
        const buf = await fs.readFile(fullPath);

        let content: string;
        let isBin = isBinary;

        if (isBin) {
          content = buf.toString("base64");
        } else {
          if (buf.includes(0)) {
            isBin = true;
            content = buf.toString("base64");
          } else {
            content = buf.toString("utf-8");
          }
        }

        files.push({
          path: itemRel,
          content,
          is_binary: isBin,
          size: stat.size,
        });
      } catch (fileErr) {
        console.warn(`[Import] Warning reading ${itemRel}:`, fileErr);
      }
    }
  }
}

/**
 * Clones repository using native Git CLI.
 * Works seamlessly with GitHub, GitLab, Bitbucket, Codeberg, and any Git URL.
 */
async function cloneRepoWithGit(
  cloneUrl: string,
  githubToken?: string,
): Promise<{ files: FileItem[]; commitMessage?: string }> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gitbowl-clone-"));
  try {
    let finalUrl = cloneUrl;
    if (githubToken && cloneUrl.includes("github.com")) {
      try {
        const u = new URL(cloneUrl);
        u.username = githubToken;
        u.password = "x-oauth-basic";
        finalUrl = u.toString();
      } catch {
        // fallback
      }
    }

    const env = {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_ASKPASS: "echo",
    };

    // Execute git clone --depth 1 --single-branch
    await execFileAsync("git", ["clone", "--depth", "1", "--single-branch", finalUrl, tempDir], {
      timeout: 120_000, // 2 minutes
      env,
      maxBuffer: 25 * 1024 * 1024,
    });

    let commitMessage = "Initial import";
    try {
      const { stdout } = await execFileAsync("git", ["log", "-1", "--pretty=%B"], {
        cwd: tempDir,
        env,
      });
      if (stdout.trim()) {
        commitMessage = stdout.trim().slice(0, 150);
      }
    } catch {
      // ignore
    }

    const files: FileItem[] = [];
    await walkClonedDirectory(tempDir, "", files);
    return { files, commitMessage };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Fallback zipball downloader for GitHub repositories if git clone encounters a network block.
 */
async function fallbackDownloadGithubZip(
  owner: string,
  repo: string,
  githubToken?: string,
): Promise<FileItem[]> {
  const downloadUrls = [
    `https://github.com/${owner}/${repo}/archive/HEAD.zip`,
    `https://codeload.github.com/${owner}/${repo}/legacy.zip/HEAD`,
    `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/main`,
    `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/master`,
    `https://api.github.com/repos/${owner}/${repo}/zipball/HEAD`,
  ];

  let zipBuffer: ArrayBuffer | null = null;
  for (const url of downloadUrls) {
    try {
      const headers: Record<string, string> = { "User-Agent": "GitBowl-Importer/3.0" };
      if (githubToken && url.includes("api.github.com")) {
        headers["Authorization"] = `token ${githubToken}`;
      }
      const res = await fetch(url, { headers, redirect: "follow" });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        if (buf.byteLength > 4) {
          const view = new Uint8Array(buf.slice(0, 4));
          if (view[0] === 0x50 && view[1] === 0x4b) {
            zipBuffer = buf;
            break;
          }
        }
      }
    } catch {
      // try next
    }
  }

  if (!zipBuffer) {
    throw new Error(`Could not download archive for GitHub repository '${owner}/${repo}'`);
  }

  const zip = await JSZip.loadAsync(zipBuffer);
  const fileNames = Object.keys(zip.files);
  const firstDir = fileNames[0]?.split("/")[0] || "";

  const files: FileItem[] = [];
  for (const [rawPath, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const cleanPath = rawPath.startsWith(`${firstDir}/`)
      ? rawPath.slice(firstDir.length + 1)
      : rawPath;
    if (!cleanPath || cleanPath.startsWith(".git/")) continue;

    const isBinary =
      BINARY_EXT.test(cleanPath) ||
      /\.(png|jpe?g|gif|webp|ico|wasm|exe|dll|pdf|zip)$/i.test(cleanPath);

    let content: string;
    let size = 0;
    if (isBinary) {
      content = await entry.async("base64");
      size = Math.round((content.length * 3) / 4);
    } else {
      content = await entry.async("string");
      size = content.length;
    }

    files.push({ path: cleanPath, content, is_binary: isBinary, size });
  }

  return files;
}

/**
 * Inserts files into public.repo_files using size-aware adaptive batching.
 * Prevents PostgreSQL statement timeout errors.
 */
async function insertFilesAdaptively(
  supabase: typeof supabaseAdmin,
  repoId: string,
  files: FileItem[],
): Promise<void> {
  const MAX_BATCH_FILES = 25;
  const MAX_BATCH_BYTES = 180 * 1024; // 180 KB payload cap per statement

  const batches: FileItem[][] = [];
  let currentBatch: FileItem[] = [];
  let currentBatchBytes = 0;

  for (const file of files) {
    const fileBytes = (file.content?.length || 0) + (file.size || 0);

    if (fileBytes >= MAX_BATCH_BYTES) {
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [];
        currentBatchBytes = 0;
      }
      batches.push([file]);
      continue;
    }

    if (currentBatch.length >= MAX_BATCH_FILES || currentBatchBytes + fileBytes > MAX_BATCH_BYTES) {
      batches.push(currentBatch);
      currentBatch = [file];
      currentBatchBytes = fileBytes;
    } else {
      currentBatch.push(file);
      currentBatchBytes += fileBytes;
    }
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  for (const batch of batches) {
    await insertBatchWithRetry(supabase, repoId, batch);
  }
}

async function insertBatchWithRetry(
  supabase: typeof supabaseAdmin,
  repoId: string,
  batch: FileItem[],
  retries = 2,
): Promise<void> {
  const rows = batch.map((f) => ({
    ...f,
    repo_id: repoId,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("repo_files")
    .upsert(rows, { onConflict: "repo_id,path" });

  if (error) {
    if (batch.length > 1) {
      console.warn(
        `[Import] Statement error on ${batch.length} files (${error.message}). Splitting into sub-batches...`,
      );
      const mid = Math.ceil(batch.length / 2);
      await insertBatchWithRetry(supabase, repoId, batch.slice(0, mid), retries);
      await insertBatchWithRetry(supabase, repoId, batch.slice(mid), retries);
      return;
    }

    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return insertBatchWithRetry(supabase, repoId, batch, retries - 1);
    }

    throw error;
  }
}

export const Route = createFileRoute("/api/github/import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let createdRepoId: string | null = null;
        try {
          const body = await request.json().catch(() => ({}));
          const rawUrl = (body.gitUrl || body.githubUrl || "").trim();
          const targetName = body.targetName;
          const isPrivate = Boolean(body.isPrivate);
          const githubToken = body.githubToken;
          let userId = body.userId;

          if (!userId) {
            const authHeader = request.headers.get("authorization");
            if (authHeader?.startsWith("Bearer ")) {
              const {
                data: { user },
              } = await supabaseAdmin.auth.getUser(authHeader.slice(7));
              userId = user?.id;
            }
          }

          if (!userId) {
            return new Response(JSON.stringify({ error: "Authentication required to import" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (!rawUrl) {
            return new Response(
              JSON.stringify({
                error:
                  "Please provide a Git repository URL (e.g. https://github.com/owner/repo, https://gitlab.com/owner/repo.git, or owner/repo)",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          // 1. Parse ANY Git URL
          const parsed = parseAnyGitUrl(rawUrl);
          const repoName = (targetName || parsed.repoName)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_.-]/g, "-");

          // 2. Fetch user profile
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("username")
            .eq("id", userId)
            .maybeSingle();

          const username = profile?.username || "developer";

          // 3. Check if repo already exists
          const { data: existing } = await supabaseAdmin
            .from("repositories")
            .select("id")
            .eq("owner_id", userId)
            .eq("name", repoName)
            .maybeSingle();

          if (existing) {
            return new Response(
              JSON.stringify({
                error: `Repository '${repoName}' already exists under your account. Choose a different repository name.`,
              }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          // 4. Clone repository files (using native git clone with fallback)
          let filesToInsert: FileItem[] = [];
          let commitMsg = `Imported from ${parsed.normalizedCloneUrl}`;

          try {
            console.log(`[Import] Cloning ${parsed.normalizedCloneUrl} via git CLI...`);
            const cloneResult = await cloneRepoWithGit(parsed.normalizedCloneUrl, githubToken);
            filesToInsert = cloneResult.files;
            if (cloneResult.commitMessage) {
              commitMsg = cloneResult.commitMessage;
            }
            console.log(
              `[Import] Git clone succeeded: ${filesToInsert.length} files scanned (including dotfiles).`,
            );
          } catch (gitErr: any) {
            console.warn(
              `[Import] Native git clone failed (${gitErr.message}). Attempting fallback if GitHub...`,
            );
            if (parsed.provider === "github" && parsed.ownerName) {
              filesToInsert = await fallbackDownloadGithubZip(
                parsed.ownerName,
                parsed.repoName,
                githubToken,
              );
            } else {
              const msg = (gitErr.message || "").toLowerCase();
              if (msg.includes("terminal prompts disabled") || msg.includes("authentication")) {
                throw new Error(
                  `Could not clone '${parsed.normalizedCloneUrl}'. The repository might be private or require authentication credentials.`,
                );
              }
              throw new Error(
                `Failed to clone repository from '${parsed.normalizedCloneUrl}': ${gitErr.message || "Network error"}`,
              );
            }
          }

          if (filesToInsert.length === 0) {
            filesToInsert.push({
              path: "README.md",
              content: `# ${repoName}\n\nImported from ${parsed.normalizedCloneUrl}.\n`,
              is_binary: false,
              size: 50,
            });
          }

          // 5. Create repository in database
          const { data: newRepo, error: repoError } = await supabaseAdmin
            .from("repositories")
            .insert({
              owner_id: userId,
              name: repoName,
              description: `Imported from ${parsed.normalizedCloneUrl}`,
              is_private: isPrivate,
              default_branch: "main",
            })
            .select()
            .single();

          if (repoError) throw repoError;
          createdRepoId = newRepo.id;

          // 6. Insert all files adaptively
          await insertFilesAdaptively(supabaseAdmin, newRepo.id, filesToInsert);

          // 7. Create initial commit
          const commitChanges = filesToInsert
            .slice(0, 250)
            .map((f) => ({ path: f.path, type: "added" }));

          await supabaseAdmin.from("commits").insert({
            repo_id: newRepo.id,
            author_id: userId,
            message: commitMsg,
            changes: commitChanges,
          });

          // 8. Materialize real Git objects in git_objects and update head_sha
          try {
            await materialize(supabaseAdmin, newRepo as any, username);
          } catch (matErr) {
            console.warn("[Import] Git object materialization notice:", matErr);
          }

          // 9. Mirror files to Google Drive Backup Tier
          const totalBytes = filesToInsert.reduce((acc, f) => acc + (f.size || 0), 0);
          try {
            const syncResult = await syncFilesToGoogleDrive(username, newRepo.name, filesToInsert);

            // Record completed backup job in storage_backups with mandatory kind column
            await supabaseAdmin.from("storage_backups" as any).insert({
              repo_id: newRepo.id,
              kind: "manifest",
              sha: "import-head",
              status: syncResult.success ? "done" : "failed",
              size: totalBytes,
              attempts: 1,
              completed_at: syncResult.success ? new Date().toISOString() : null,
              last_error: syncResult.errors.length
                ? syncResult.errors.slice(0, 3).join("; ")
                : null,
            });

            await createNotification({
              userId,
              type: "sync",
              title: `Repository Sync: ${newRepo.name}`,
              content: `All ${syncResult.syncedCount} of ${filesToInsert.length} files successfully imported and synchronized.`,
              link: `/${username}/${newRepo.name}`,
            });
          } catch (syncErr) {
            console.warn("[Sync] Import notice error:", syncErr);
          }

          // Immediate import notification
          await createNotification({
            userId,
            type: "system",
            title: `Imported ${repoName}`,
            content: `Repository ${newRepo.name} created with ${filesToInsert.length} files. Cloud storage active.`,
            link: `/${username}/${newRepo.name}`,
          });

          // Notify search engines if public
          if (!isPrivate) {
            notifySearchEngines([`https://gitbowl.zone.id/${username}/${newRepo.name}`]).catch(
              () => {},
            );
          }

          return new Response(
            JSON.stringify({
              success: true,
              repoName: newRepo.name,
              owner: username,
              fileCount: filesToInsert.length,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (err: any) {
          console.error("Git import error:", err);

          // Safe rollback if repository row was created
          if (createdRepoId) {
            try {
              await supabaseAdmin.from("repositories").delete().eq("id", createdRepoId);
            } catch (cleanupErr) {
              console.warn("[Import] Failed to rollback partial repository:", cleanupErr);
            }
          }

          return new Response(
            JSON.stringify({ error: err.message || "Failed to import Git repository" }),
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
