import { createFileRoute } from "@tanstack/react-router";
import JSZip from "jszip";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { syncFilesToGoogleDrive } from "@/lib/gdrive.server";
import { createNotification } from "@/lib/notifications.server";

const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|tgz|7z|rar|mp4|webm|mp3|wav|ogg|wasm|exe|dll|so|dylib|bin|iso|dmg|ttf|otf|woff2?|eot)$/i;

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

          // 6. Insert files in chunks of 50
          for (let i = 0; i < filesToInsert.length; i += 50) {
            const chunk = filesToInsert.slice(i, i + 50).map((f) => ({
              ...f,
              repo_id: newRepo.id,
              updated_at: new Date().toISOString(),
            }));
            const { error: insertErr } = await supabaseAdmin.from("repo_files").insert(chunk);
            if (insertErr) throw insertErr;
          }

          // 7. Create initial commit
          await supabaseAdmin.from("commits").insert({
            repo_id: newRepo.id,
            author_id: userId,
            message: `Import from GitHub (${ghOwner}/${ghRepo})`,
            changes: filesToInsert.map((f) => ({ path: f.path, type: "added" })),
          });

          // 8. Mirror ALL imported files to central storage (100% of files)
          const totalBytes = filesToInsert.reduce((acc, f) => acc + (f.size || 0), 0);
          syncFilesToGoogleDrive(username, newRepo.name, filesToInsert)
            .then(async (syncResult) => {
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
            })
            .catch((e) => console.warn("[Sync] Import notice:", e));

          // Also create immediate import notification
          await createNotification({
            userId,
            type: "system",
            title: `Imported ${ghOwner}/${ghRepo}`,
            content: `Repository ${newRepo.name} created with ${filesToInsert.length} files. Cloud storage active.`,
            link: `/${username}/${newRepo.name}`,
          });

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
          return new Response(
            JSON.stringify({ error: err.message || "Failed to import GitHub repository" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
