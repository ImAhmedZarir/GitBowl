import { createFileRoute } from "@tanstack/react-router";
import JSZip from "jszip";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { syncFilesToGoogleDrive } from "@/lib/gdrive.server";
import { createNotification } from "@/lib/notifications.server";
import { notifySearchEngines } from "@/lib/indexnow.server";

const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|tgz|7z|rar|mp4|webm|mp3|wav|ogg|wasm|exe|dll|so|dylib|bin|iso|dmg|ttf|otf|woff2?|eot)$/i;

interface FileItem {
  path: string;
  content: string;
  is_binary: boolean;
  size: number;
}

/**
 * Inserts files into public.repo_files using size-aware adaptive batching.
 * Prevents PostgreSQL 'canceling statement due to statement timeout' by ensuring
 * no single SQL statement has an excessive row count or large payload.
 */
async function insertFilesAdaptively(
  supabase: typeof supabaseAdmin,
  repoId: string,
  files: FileItem[],
): Promise<void> {
  const MAX_BATCH_FILES = 15;
  const MAX_BATCH_BYTES = 180 * 1024; // 180 KB payload cap per SQL query

  const batches: FileItem[][] = [];
  let currentBatch: FileItem[] = [];
  let currentBatchBytes = 0;

  for (const file of files) {
    const fileBytes = (file.content?.length || 0) + (file.size || 0);

    // Large individual files get isolated into their own dedicated statement
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

  // Execute each batch with retry & recursive subdivision on timeout
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

  const { error } = await supabase.from("repo_files").insert(rows);

  if (error) {
    const errText = (error.message || "").toLowerCase();
    const isTimeout =
      errText.includes("statement timeout") ||
      errText.includes("canceling statement") ||
      (error as any).code === "57014";

    // If batch contains multiple files and hit a timeout or error, split into smaller sub-batches
    if (batch.length > 1) {
      console.warn(
        `[Import] Statement error on batch of ${batch.length} files (${error.message}). Splitting into smaller sub-batches...`,
      );
      const mid = Math.ceil(batch.length / 2);
      await insertBatchWithRetry(supabase, repoId, batch.slice(0, mid), retries);
      await insertBatchWithRetry(supabase, repoId, batch.slice(mid), retries);
      return;
    }

    // Single-file retry
    if (retries > 0) {
      console.warn(
        `[Import] Retrying single file insert: ${batch[0]?.path} (${retries} retries left)`,
      );
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
        try {
          const body = await request.json();
          let { githubUrl, targetName, isPrivate, githubToken, userId } = body;

          // If userId not sent in body, try Bearer token
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

          // Robust GitHub URL parsing:
          // Handles:
          // - https://github.com/facebook/react
          // - https://github.com/facebook/react.git
          // - git@github.com:facebook/react.git
          // - github.com/facebook/react/tree/main
          // - facebook/react
          const rawInput = (githubUrl || "").trim();
          const match = rawInput.match(
            /(?:github\.com[:/]|git@github\.com:)?([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/,
          );

          if (!match || !match[1] || !match[2]) {
            return new Response(
              JSON.stringify({
                error:
                  "Invalid GitHub repository format. Example: owner/repo or https://github.com/owner/repo",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          const ghOwner = match[1];
          const ghRepo = match[2].replace(/\.git$/i, "");

          const repoName = (targetName || ghRepo)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_.-]/g, "-");

          // 1. Fetch user profile
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("username")
            .eq("id", userId)
            .maybeSingle();

          const username = profile?.username || "developer";

          // 2. Check if repo already exists
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

          // 3. Multi-strategy zipball download
          const downloadUrls: string[] = [];

          if (githubToken) {
            downloadUrls.push(`https://api.github.com/repos/${ghOwner}/${ghRepo}/zipball/HEAD`);
          }

          downloadUrls.push(
            `https://github.com/${ghOwner}/${ghRepo}/archive/HEAD.zip`,
            `https://codeload.github.com/${ghOwner}/${ghRepo}/legacy.zip/HEAD`,
            `https://codeload.github.com/${ghOwner}/${ghRepo}/zip/refs/heads/main`,
            `https://codeload.github.com/${ghOwner}/${ghRepo}/zip/refs/heads/master`,
            `https://api.github.com/repos/${ghOwner}/${ghRepo}/zipball/HEAD`,
          );

          let zipBuffer: ArrayBuffer | null = null;
          let lastErrorMessage = "";

          for (const url of downloadUrls) {
            try {
              const headers: Record<string, string> = {
                "User-Agent": "GitBowl-Importer/2.0",
              };
              if (githubToken && url.includes("api.github.com")) {
                headers["Authorization"] = `token ${githubToken}`;
              }

              const res = await fetch(url, { headers, redirect: "follow" });

              if (res.ok) {
                const buf = await res.arrayBuffer();
                // Verify zip magic bytes: PK\x03\x04
                if (buf.byteLength > 4) {
                  const view = new Uint8Array(buf.slice(0, 4));
                  if (view[0] === 0x50 && view[1] === 0x4b) {
                    zipBuffer = buf;
                    break;
                  }
                }
              } else if (res.status === 404) {
                lastErrorMessage = `GitHub repository '${ghOwner}/${ghRepo}' not found or is private (sign in with GitHub for private repos).`;
              } else if (res.status === 403) {
                lastErrorMessage = "GitHub API rate limit exceeded. Please sign in with GitHub.";
              }
            } catch (fetchErr: any) {
              lastErrorMessage = fetchErr?.message || "Network error downloading repository";
            }
          }

          if (!zipBuffer) {
            return new Response(
              JSON.stringify({
                error:
                  lastErrorMessage ||
                  `Could not download repository '${ghOwner}/${ghRepo}'. Please verify the repository name.`,
              }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          // 4. Unpack zipball with JSZip
          const zip = await JSZip.loadAsync(zipBuffer);
          const fileNames = Object.keys(zip.files);
          const firstDir = fileNames[0]?.split("/")[0] || "";

          const filesToInsert: {
            path: string;
            content: string;
            is_binary: boolean;
            size: number;
          }[] = [];

          for (const [rawPath, zipEntry] of Object.entries(zip.files)) {
            if (zipEntry.dir) continue;

            const cleanPath = rawPath.startsWith(`${firstDir}/`)
              ? rawPath.slice(firstDir.length + 1)
              : rawPath;

            if (!cleanPath || cleanPath.startsWith(".git/")) continue;

            // Skip excessively large individual files (> 10MB in zip)
            if ((zipEntry as any)._data?.uncompressedSize > 10 * 1024 * 1024) continue;

            const isBinary =
              BINARY_EXT.test(cleanPath) ||
              /\.(png|jpe?g|gif|webp|ico|wasm|exe|dll|pdf|zip)$/i.test(cleanPath);

            let content: string;
            let size = 0;

            if (isBinary) {
              content = await zipEntry.async("base64");
              size = Math.round((content.length * 3) / 4);
            } else {
              content = await zipEntry.async("string");
              size = content.length;
            }

            filesToInsert.push({
              path: cleanPath,
              content,
              is_binary: isBinary,
              size,
            });
          }

          if (filesToInsert.length === 0) {
            // Default README if zip was empty
            filesToInsert.push({
              path: "README.md",
              content: `# ${repoName}\n\nImported from GitHub ${ghOwner}/${ghRepo}.\n`,
              is_binary: false,
              size: 50,
            });
          }

          let createdRepoId: string | null = null;

          // 5. Create repository in GitBowl
          const { data: newRepo, error: repoError } = await supabaseAdmin
            .from("repositories")
            .insert({
              owner_id: userId,
              name: repoName,
              description: `Imported from GitHub ${ghOwner}/${ghRepo}`,
              is_private: Boolean(isPrivate),
              default_branch: "main",
            })
            .select()
            .single();

          if (repoError) throw repoError;
          createdRepoId = newRepo.id;

          // 6. Insert files using adaptive size-aware batching (prevents statement timeout)
          await insertFilesAdaptively(supabaseAdmin, newRepo.id, filesToInsert);

          // 7. Create initial commit (cap changes array at 250 items to keep jsonb payload lightweight)
          const commitChanges = filesToInsert
            .slice(0, 250)
            .map((f) => ({ path: f.path, type: "added" }));

          await supabaseAdmin.from("commits").insert({
            repo_id: newRepo.id,
            author_id: userId,
            message: `Import from GitHub (${ghOwner}/${ghRepo})`,
            changes: commitChanges,
          });

          // 8. Mirror ALL imported files to central storage (100% of files)
          const totalBytes = filesToInsert.reduce((acc, f) => acc + (f.size || 0), 0);
          try {
            const syncResult = await syncFilesToGoogleDrive(username, newRepo.name, filesToInsert);

            // Record in storage_backups table for Admin Center visibility
            await supabaseAdmin.from("storage_backups" as any).insert({
              repo_id: newRepo.id,
              sha: "import-head",
              status: syncResult.success ? "done" : "failed",
              size: totalBytes,
              attempts: 1,
              last_error: syncResult.errors.length
                ? syncResult.errors.slice(0, 3).join("; ")
                : null,
            });

            // Create user notification
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

          // Also create immediate import notification
          await createNotification({
            userId,
            type: "system",
            title: `Imported ${ghOwner}/${ghRepo}`,
            content: `Repository ${newRepo.name} created with ${filesToInsert.length} files. Cloud storage active.`,
            link: `/${username}/${newRepo.name}`,
          });

          // If repository is public, notify search engines immediately for super-fast indexation
          if (!isPrivate) {
            notifySearchEngines([`https://gitbowl.zone.id/${username}/${newRepo.name}`]).catch(
              (e) => console.warn("[SEO] IndexNow notify notice:", e),
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
          console.error("GitHub import error:", err);

          // Clean rollback: if repository row was created but file insertion or commits failed,
          // delete the partial repository so the user does not get blocked with 'repo already exists' on retry.
          if (createdRepoId) {
            try {
              await supabaseAdmin.from("repositories").delete().eq("id", createdRepoId);
              console.info(
                `[Import] Cleaned up partial repository '${createdRepoId}' after import error`,
              );
            } catch (cleanupErr) {
              console.warn("[Import] Failed to rollback partial repository:", cleanupErr);
            }
          }

          const rawError = err.message || "Failed to import GitHub repository";
          // Present user-friendly explanation if Postgres statement timeout occurred
          const isTimeout =
            rawError.includes("statement timeout") ||
            rawError.includes("canceling statement") ||
            (err as any).code === "57014";

          const friendlyMessage = isTimeout
            ? "Database statement timeout during bulk file write. The repository import has been rolled back safely. Please retry or import with fewer large binary files."
            : rawError;

          return new Response(JSON.stringify({ error: friendlyMessage }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
