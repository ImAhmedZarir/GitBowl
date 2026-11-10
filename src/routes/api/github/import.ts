import { createFileRoute } from "@tanstack/react-router";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import dns from "node:dns/promises";
import JSZip from "jszip";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { syncFilesToGoogleDrive } from "@/lib/gdrive.server";
import { createNotification } from "@/lib/notifications.server";
import { notifySearchEngines } from "@/lib/indexnow.server";
import { materialize } from "@/lib/git.server";
import { getActor } from "@/lib/authz.server";
import {
  sanitizeUnicode,
  sanitizeFilePath,
  sanitizeFileRecord,
  sanitizeCommitMessage,
} from "@/lib/unicode";

const execFileAsync = promisify(execFile);

const ALLOWED_GIT_HOSTS = new Set([
  "github.com",
  "gitlab.com",
  "bitbucket.org",
  "codeberg.org",
]);

const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|tgz|7z|rar|mp4|webm|mp3|wav|ogg|wasm|exe|dll|so|dylib|bin|iso|dmg|ttf|otf|woff2?|eot)$/i;

// In-memory rate limiter: 5 imports/hour per user, 10/hour per IP
const importAttempts = new Map<string, { count: number; resetAt: number }>();

function checkImportRateLimit(key: string, limit: number, windowMs = 60 * 60 * 1000): boolean {
  const now = Date.now();
  const entry = importAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    importAttempts.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count++;
  return entry.count > limit;
}

function isPrivateIp(ip: string): boolean {
  const trimmed = ip.trim().toLowerCase();
  if (trimmed === "localhost" || trimmed === "::1" || trimmed === "0.0.0.0") return true;

  // IPv4 checks
  if (trimmed.includes(".")) {
    const parts = trimmed.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return true;
    if (parts[0] === 0) return true; // 0.0.0.0/8
    if (parts[0] === 10) return true; // 10.0.0.0/8
    if (parts[0] === 127) return true; // 127.0.0.0/8
    if (parts[0] === 169 && parts[1] === 254) return true; // 169.254.0.0/16 (link local & metadata)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
    if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true; // 100.64.0.0/10 CGNAT
    if (parts[0] >= 224) return true; // Multicast & reserved
  }

  // IPv6 checks
  if (trimmed.includes(":")) {
    if (trimmed.startsWith("fc") || trimmed.startsWith("fd")) return true; // Unique local
    if (trimmed.startsWith("fe80")) return true; // Link local
    if (trimmed.startsWith("::ffff:")) {
      const v4Part = trimmed.replace("::ffff:", "");
      return isPrivateIp(v4Part);
    }
  }

  return false;
}

export async function validateAndResolveGitHost(host: string): Promise<void> {
  const cleanHost = host.toLowerCase().trim();
  if (!ALLOWED_GIT_HOSTS.has(cleanHost)) {
    throw new Error(
      `Host '${cleanHost}' is not allowed for repository imports. Supported hosts: github.com, gitlab.com, bitbucket.org, codeberg.org`,
    );
  }

  try {
    const addresses = await dns.lookup(cleanHost, { all: true });
    for (const record of addresses) {
      if (isPrivateIp(record.address)) {
        throw new Error(`Host '${cleanHost}' resolved to restricted IP ${record.address}`);
      }
    }
  } catch (err: any) {
    if (err.message.includes("restricted IP") || err.message.includes("not allowed")) throw err;
    throw new Error(`DNS lookup failed for '${cleanHost}': ${err.message}`);
  }
}

interface FileItem {
  path: string;
  content: string;
  is_binary: boolean;
  size: number;
}

export function parseAnyGitUrl(rawInput: string): {
  normalizedCloneUrl: string;
  repoName: string;
  provider: "github" | "gitlab" | "bitbucket" | "codeberg";
  ownerName?: string;
} {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error("Git repository URL is required");
  }

  // Shorthand: "owner/repo" (assumed GitHub)
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

  let urlObj: URL;
  try {
    const withProto = /^[a-zA-Z]+:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
    urlObj = new URL(withProto);
  } catch {
    throw new Error(
      `Invalid Git URL format: "${trimmed}". Examples: owner/repo, https://github.com/owner/repo`,
    );
  }

  if (urlObj.protocol !== "https:") {
    throw new Error("Only secure HTTPS Git URLs are supported for repository import");
  }

  const host = urlObj.hostname.toLowerCase();
  let provider: "github" | "gitlab" | "bitbucket" | "codeberg" | null = null;
  if (host === "github.com") provider = "github";
  else if (host === "gitlab.com") provider = "gitlab";
  else if (host === "bitbucket.org") provider = "bitbucket";
  else if (host === "codeberg.org") provider = "codeberg";

  if (!provider) {
    throw new Error(
      `Unsupported host '${host}'. Imports are strictly restricted to github.com, gitlab.com, bitbucket.org, and codeberg.org.`,
    );
  }

  const pathParts = urlObj.pathname
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);
  if (pathParts.length === 0) {
    throw new Error(`Invalid Git repository path in URL: "${trimmed}"`);
  }

  const rawLastPart = pathParts[pathParts.length - 1] || "imported-repo";
  const repoName = rawLastPart.replace(/\.git$/i, "");

  let normalizedCloneUrl = `https://${host}/${pathParts.join("/")}`;
  if (!normalizedCloneUrl.endsWith(".git")) {
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
 * Recursively scans directory and collects files with strict security controls:
 * - NO symlinks followed (isSymbolicLink check)
 * - Verifies realpath stays inside baseDir
 * - Max 5,000 files
 * - Max 15MB per file
 * - Max 200MB total repository size
 */
async function walkClonedDirectory(
  baseDir: string,
  relPath: string,
  files: FileItem[],
  totalSizeRef: { bytes: number; count: number },
  canonicalBase: string,
): Promise<void> {
  const currentDir = path.join(baseDir, relPath);
  const entries = await fs.readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === ".git") continue; // Exclude internal git control directory

    if (totalSizeRef.count >= 5000) {
      throw new Error("Repository exceeds maximum limit of 5,000 files. Import halted.");
    }

    const rawItemRel = relPath ? `${relPath}/${entry.name}` : entry.name;
    const itemRel = rawItemRel.replace(/\\/g, "/").replace(/^\/+/, "");
    const fullPath = path.join(currentDir, entry.name);

    // Defense against symlinks: NEVER follow symlinks!
    if (entry.isSymbolicLink()) {
      console.warn(`[Security] Skipping symlink entry during import: ${itemRel}`);
      continue;
    }

    if (entry.isDirectory()) {
      await walkClonedDirectory(baseDir, itemRel, files, totalSizeRef, canonicalBase);
    } else if (entry.isFile()) {
      try {
        // Double-check realpath stays strictly inside canonical clone base
        const real = await fs.realpath(fullPath);
        if (!real.startsWith(canonicalBase)) {
          console.warn(`[Security] Blocked path traversal attempt on ${itemRel}`);
          continue;
        }

        const stat = await fs.stat(fullPath);
        if (stat.size > 15 * 1024 * 1024) {
          console.warn(`[Import] Skipping file exceeding 15MB: ${itemRel} (${stat.size} bytes)`);
          continue;
        }

        if (totalSizeRef.bytes + stat.size > 200 * 1024 * 1024) {
          throw new Error("Repository total size exceeds 200MB limit. Import halted.");
        }

        const isBinary = BINARY_EXT.test(itemRel);
        const buf = await fs.readFile(fullPath);

        let content: string;
        let isBin = isBinary || buf.includes(0);

        if (isBin) {
          content = buf.toString("base64");
        } else {
          content = sanitizeUnicode(buf.toString("utf-8"));
          if (content.includes("\0")) {
            isBin = true;
            content = buf.toString("base64");
          }
        }

        const fileRecord = sanitizeFileRecord({
          path: itemRel,
          content,
          is_binary: isBin,
          size: isBin ? buf.length : Buffer.byteLength(content, "utf-8"),
        });

        files.push(fileRecord);
        totalSizeRef.bytes += fileRecord.size;
        totalSizeRef.count += 1;
      } catch (fileErr: any) {
        if (fileErr.message.includes("limit")) throw fileErr;
        console.warn(`[Import] Warning reading ${itemRel}:`, fileErr);
      }
    }
  }
}

async function cloneRepoWithGit(
  cloneUrl: string,
  githubToken?: string,
): Promise<{ files: FileItem[]; commitMessage?: string }> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gitbowl-clone-"));
  const canonicalBase = await fs.realpath(tempDir);

  try {
    const gitArgs = [
      "-c", "protocol.allow=never",
      "-c", "protocol.https.allow=always",
    ];

    if (githubToken && cloneUrl.includes("github.com")) {
      const sanitizedToken = githubToken.replace(/[\r\n]/g, "").trim();
      gitArgs.push("-c", `http.extraHeader=Authorization: Bearer ${sanitizedToken}`);
    }

    gitArgs.push("clone", "--depth", "1", "--single-branch", "--no-tags", "--", cloneUrl, tempDir);

    const env = {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_ASKPASS: "echo",
    };

    await execFileAsync("git", gitArgs, {
      timeout: 120_000,
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
    const sizeTracker = { bytes: 0, count: 0 };
    await walkClonedDirectory(tempDir, "", files, sizeTracker, canonicalBase);
    return { files, commitMessage };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

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
        headers["Authorization"] = `token ${githubToken.replace(/[\r\n]/g, "").trim()}`;
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
  let totalBytes = 0;

  for (const [rawPath, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const cleanPath = rawPath.startsWith(`${firstDir}/`)
      ? rawPath.slice(firstDir.length + 1)
      : rawPath;
    if (!cleanPath || cleanPath.startsWith(".git/")) continue;

    if (files.length >= 5000) {
      throw new Error("Repository archive exceeds 5,000 files limit.");
    }

    const buf = await entry.async("nodebuffer");
    if (buf.length > 15 * 1024 * 1024) continue; // Skip single files >15MB

    if (totalBytes + buf.length > 200 * 1024 * 1024) {
      throw new Error("Repository archive exceeds 200MB size limit.");
    }

    const isBinary =
      BINARY_EXT.test(cleanPath) ||
      /\.(png|jpe?g|gif|webp|ico|wasm|exe|dll|pdf|zip|bin|dat|sqlite|db|pyc|jar|class|so|dylib|wasm)$/i.test(
        cleanPath,
      ) ||
      buf.includes(0);

    let content: string;
    let size = buf.length;
    let isBin = isBinary;

    if (isBin) {
      content = buf.toString("base64");
    } else {
      content = sanitizeUnicode(buf.toString("utf-8"));
      if (content.includes("\0")) {
        isBin = true;
        content = buf.toString("base64");
      }
    }

    files.push(
      sanitizeFileRecord({
        path: cleanPath,
        content,
        is_binary: isBin,
        size,
      }),
    );
    totalBytes += size;
  }

  return files;
}

async function insertFilesAdaptively(
  supabase: typeof supabaseAdmin,
  repoId: string,
  files: FileItem[],
): Promise<void> {
  const MAX_BATCH_FILES = 25;
  const MAX_BATCH_BYTES = 180 * 1024;

  const sanitized = files.map((f) => sanitizeFileRecord(f));
  const batches: FileItem[][] = [];
  let currentBatch: FileItem[] = [];
  let currentBatchBytes = 0;

  for (const file of sanitized) {
    const fileBytes = file.size || (file.content ? Buffer.byteLength(file.content) : 0);
    if (
      currentBatch.length >= MAX_BATCH_FILES ||
      (currentBatchBytes + fileBytes > MAX_BATCH_BYTES && currentBatch.length > 0)
    ) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBatchBytes = 0;
    }
    currentBatch.push(file);
    currentBatchBytes += fileBytes;
  }
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  for (const batch of batches) {
    await insertBatchWithRetry(supabase, repoId, batch, 3);
  }
}

async function insertBatchWithRetry(
  supabase: typeof supabaseAdmin,
  repoId: string,
  batch: FileItem[],
  retries: number,
): Promise<void> {
  const records = batch.map((f) => ({
    repo_id: repoId,
    path: sanitizeFilePath(f.path),
    content: f.content,
    is_binary: f.is_binary,
    size: f.size,
  }));

  const { error } = await supabase.from("repo_files").insert(records);
  if (!error) return;

  if (batch.length > 1) {
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

export const Route = createFileRoute("/api/github/import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let createdRepoId: string | null = null;
        try {
          const actor = await getActor(request);
          if (!actor) {
            return new Response(JSON.stringify({ error: "Authentication required to import" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

          const clientIp =
            request.headers.get("cf-connecting-ip") ||
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            "127.0.0.1";

          // Enforce rate limits: 5 imports/hour per user, 10/hour per IP
          if (checkImportRateLimit(`user:${actor.userId}`, 5)) {
            return new Response(
              JSON.stringify({ error: "Import limit exceeded: max 5 imports per hour per account." }),
              { status: 429, headers: { "Content-Type": "application/json" } },
            );
          }
          if (checkImportRateLimit(`ip:${clientIp}`, 10)) {
            return new Response(
              JSON.stringify({ error: "Too many import requests from this network. Please wait." }),
              { status: 429, headers: { "Content-Type": "application/json" } },
            );
          }

          const body = await request.json().catch(() => ({}));
          const rawUrl = (body.gitUrl || body.githubUrl || "").trim();
          const targetName = body.targetName;
          const isPrivate = Boolean(body.isPrivate);
          const githubToken = body.githubToken;
          const userId = actor.userId; // Strictly use actor.userId, NEVER body.userId!

          if (!rawUrl) {
            return new Response(
              JSON.stringify({
                error:
                  "Please provide a Git repository URL (e.g. https://github.com/owner/repo or owner/repo)",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          // 1. Parse Git URL with strict scheme and provider restrictions
          const parsed = parseAnyGitUrl(rawUrl);

          // 2. Perform DNS validation and anti-SSRF verification
          const host = new URL(parsed.normalizedCloneUrl).hostname;
          await validateAndResolveGitHost(host);

          const repoName = (targetName || parsed.repoName)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_.-]/g, "-");

          // 3. Fetch user profile
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("username")
            .eq("id", userId)
            .maybeSingle();

          const username = profile?.username || actor.username || "developer";

          // 4. Check if repo already exists
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

          // 5. Clone repository files (using native git CLI with secure protocol restrictions)
          let filesToInsert: FileItem[] = [];
          let commitMsg = `Imported from ${parsed.normalizedCloneUrl}`;

          try {
            console.log(`[Import] Securely cloning ${parsed.normalizedCloneUrl}...`);
            const cloneResult = await cloneRepoWithGit(parsed.normalizedCloneUrl, githubToken);
            filesToInsert = cloneResult.files;
            if (cloneResult.commitMessage) {
              commitMsg = cloneResult.commitMessage;
            }
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
                `Failed to clone repository: ${gitErr.message || "Network error"}`,
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

          // 6. Create repository in database
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

          // 7. Insert all files adaptively
          await insertFilesAdaptively(supabaseAdmin, newRepo.id, filesToInsert);

          // 8. Create initial commit
          const commitChanges = filesToInsert
            .slice(0, 250)
            .map((f) => ({ path: sanitizeFilePath(f.path), type: "added" }));

          await supabaseAdmin.from("commits").insert({
            repo_id: newRepo.id,
            author_id: userId,
            message: sanitizeCommitMessage(commitMsg, "Initial import from GitHub"),
            changes: commitChanges,
          });

          // 9. Materialize real Git objects in git_objects and update head_sha
          try {
            await materialize(supabaseAdmin, newRepo as any, username);
          } catch (matErr) {
            console.warn("[Import] Git object materialization notice:", matErr);
          }

          // 10. Mirror files to Google Drive Backup Tier
          const totalBytes = filesToInsert.reduce((acc, f) => acc + (f.size || 0), 0);
          try {
            const syncResult = await syncFilesToGoogleDrive(username, newRepo.name, filesToInsert);

            await supabaseAdmin.from("storage_backups" as any).insert({
              repo_id: newRepo.id,
              kind: "manifest",
              sha: "import-head",
              status: syncResult.success ? "done" : "failed",
              size: totalBytes,
              attempts: 1,
              completed_at: syncResult.success ? new Date().toISOString() : null,
              last_error: syncResult.errors.length
                ? sanitizeUnicode(syncResult.errors.slice(0, 3).join("; "))
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
