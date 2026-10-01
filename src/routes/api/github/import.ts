import { createFileRoute } from "@tanstack/react-router";
import JSZip from "jszip";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|tgz|7z|rar|mp4|webm|mp3|wav|ogg|wasm|exe|dll|so|dylib|bin|iso|dmg|ttf|otf|woff2?|eot)$/i;

export const Route = createFileRoute("/api/github/import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { githubUrl, targetName, isPrivate, githubToken, userId } = body;

          if (!userId) {
            return new Response(JSON.stringify({ error: "Authentication required" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Parse owner and repo from URL or string
          // e.g. "https://github.com/facebook/react" or "facebook/react"
          const clean = (githubUrl || "")
            .trim()
            .replace(/^https?:\/\/github\.com\//, "")
            .replace(/\.git$/, "")
            .replace(/\/$/, "");

          const parts = clean.split("/");
          if (parts.length < 2) {
            return new Response(
              JSON.stringify({ error: "Invalid GitHub repository. Format: owner/repo" }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          const [ghOwner, ghRepo] = parts;
          const repoName = (targetName || ghRepo)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_.-]/g, "-");

          // 1. Fetch user profile for username
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("username")
            .eq("id", userId)
            .maybeSingle();

          const username = profile?.username || "user";

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
                error: `Repository '${repoName}' already exists under your account.`,
              }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          // 3. Fetch zipball from GitHub API
          const ghHeaders: Record<string, string> = {
            "User-Agent": "GitBowl-Importer/1.0",
            Accept: "application/vnd.github.v3+json",
          };
          if (githubToken) {
            ghHeaders["Authorization"] = `token ${githubToken}`;
          }

          const ghRes = await fetch(
            `https://api.github.com/repos/${ghOwner}/${ghRepo}/zipball/HEAD`,
            { headers: ghHeaders, redirect: "follow" },
          );

          if (!ghRes.ok) {
            if (ghRes.status === 404) {
              return new Response(
                JSON.stringify({
                  error: `GitHub repository ${ghOwner}/${ghRepo} not found or is private (require GitHub login).`,
                }),
                { status: 404, headers: { "Content-Type": "application/json" } },
              );
            }
            if (ghRes.status === 403 || ghRes.status === 401) {
              return new Response(
                JSON.stringify({
                  error:
                    "GitHub API rate limit or authentication required. Please sign in with GitHub.",
                }),
                { status: 403, headers: { "Content-Type": "application/json" } },
              );
            }
            throw new Error(`GitHub returned HTTP ${ghRes.status}`);
          }

          const arrayBuf = await ghRes.arrayBuffer();
          const zip = await JSZip.loadAsync(arrayBuf);

          // Find root prefix (GitHub zipballs contain a top-level dir like 'owner-repo-hash/')
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

            // Strip the top-level github root directory
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

          // 4. Create repository in GitBowl
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

          // 5. Insert files in chunks of 100
          for (let i = 0; i < filesToInsert.length; i += 100) {
            const chunk = filesToInsert.slice(i, i + 100).map((f) => ({
              ...f,
              repo_id: newRepo.id,
              updated_at: new Date().toISOString(),
            }));
            const { error: insertErr } = await supabaseAdmin.from("repo_files").insert(chunk);
            if (insertErr) throw insertErr;
          }

          // 6. Create initial commit
          await supabaseAdmin.from("commits").insert({
            repo_id: newRepo.id,
            author_id: userId,
            message: `Import from GitHub (${ghOwner}/${ghRepo})`,
            changes: filesToInsert.map((f) => ({ path: f.path, type: "added" })),
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
