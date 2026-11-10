// src/routes/api/repo/branches.ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { getActor, requireRepoAccess } from "@/lib/authz.server";

function isValidRefFormat(name: string): boolean {
  if (!name || name.length > 255) return false;
  // Git check-ref-format rules:
  // Cannot begin or end with slash, cannot contain .. or consecutive slashes
  if (name.startsWith("/") || name.endsWith("/") || name.includes("//") || name.includes("..")) {
    return false;
  }
  // Cannot contain ~, ^, :, ?, *, [, \, space, or control characters
  if (/[\s~^:?*\[\\@\{\}]/.test(name)) {
    return false;
  }
  // Cannot end with .lock or slash
  if (name.endsWith(".lock")) {
    return false;
  }
  return true;
}

export const Route = createFileRoute("/api/repo/branches")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const repoId = url.searchParams.get("repoId");

          if (!repoId) {
            return new Response(JSON.stringify({ error: "Missing repoId" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const supabase = getSupabaseAdmin();
          const { data: repo, error: repoErr } = await supabase
            .from("repositories")
            .select("id, name, is_private, owner_id, org_id, default_branch, head_sha")
            .eq("id", repoId)
            .maybeSingle();

          if (repoErr || !repo) {
            return new Response(JSON.stringify({ error: "Repository not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          const actor = await getActor(request);
          const access = await requireRepoAccess(actor, repo, "read");
          if (!access.allowed) {
            return new Response(JSON.stringify({ error: "Access denied" }), {
              status: access.status || 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          const { data: refs, error } = await supabase
            .from("refs" as any)
            .select("id, name, sha, updated_at")
            .eq("repo_id", repoId)
            .order("updated_at", { ascending: false });

          if (error) throw error;

          const defaultBranch = repo?.default_branch || "main";
          const branches = (refs || [])
            .filter((r: any) => r.name.startsWith("refs/heads/"))
            .map((r: any) => ({
              name: r.name.replace(/^refs\/heads\//, ""),
              ref: r.name,
              sha: r.sha,
              updatedAt: r.updated_at,
              isDefault: r.name.replace(/^refs\/heads\//, "") === defaultBranch,
            }));

          if (branches.length === 0 && repo) {
            branches.push({
              name: defaultBranch,
              ref: `refs/heads/${defaultBranch}`,
              sha: repo.head_sha || "HEAD",
              updatedAt: new Date().toISOString(),
              isDefault: true,
            });
          }

          const isPrivate = Boolean(repo.is_private);
          return new Response(JSON.stringify({ branches }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": isPrivate ? "private, no-store" : "public, max-age=60",
            },
          });
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: err.message || "Failed to fetch branches" }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      },

      POST: async ({ request }) => {
        try {
          const actor = await getActor(request);
          if (!actor) {
            return new Response(JSON.stringify({ error: "Authentication required" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

          const body = await request.json().catch(() => ({}));
          const { repoId, branchName, fromSha } = body;

          if (!repoId || !branchName?.trim()) {
            return new Response(JSON.stringify({ error: "Missing required fields" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const cleanName = branchName
            .trim()
            .replace(/^refs\/heads\//, "")
            .replace(/\s+/g, "-");

          if (!isValidRefFormat(cleanName)) {
            return new Response(
              JSON.stringify({
                error: "Invalid branch name format per Git ref rules (no spaces, ~, ^, :, ?, *, .., or .lock)",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          const refName = `refs/heads/${cleanName}`;
          const supabase = getSupabaseAdmin();

          const { data: repo, error: repoErr } = await supabase
            .from("repositories")
            .select("id, is_private, owner_id, org_id, head_sha")
            .eq("id", repoId)
            .maybeSingle();

          if (repoErr || !repo) {
            return new Response(JSON.stringify({ error: "Repository not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          const access = await requireRepoAccess(actor, repo, "write");
          if (!access.allowed) {
            return new Response(
              JSON.stringify({ error: access.error || "Write access required" }),
              { status: access.status || 403, headers: { "Content-Type": "application/json" } },
            );
          }

          let targetSha = fromSha;
          if (!targetSha) {
            targetSha = repo.head_sha || "initial";
          }

          const { data: newRef, error: insertError } = await supabase
            .from("refs" as any)
            .upsert(
              {
                repo_id: repoId,
                name: refName,
                sha: targetSha,
                updated_at: new Date().toISOString(),
              } as any,
              { onConflict: "repo_id,name" },
            )
            .select("id, name, sha")
            .single();

          if (insertError) throw insertError;

          return new Response(
            JSON.stringify({
              success: true,
              branch: {
                name: cleanName,
                ref: refName,
                sha: (newRef as any)?.sha,
              },
            }),
            { status: 201, headers: { "Content-Type": "application/json" } },
          );
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message || "Failed to create branch" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
