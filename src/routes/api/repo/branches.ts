// src/routes/api/repo/branches.ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";

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
          const { data: refs, error } = await supabase
            .from("refs" as any)
            .select("id, name, sha, updated_at")
            .eq("repo_id", repoId)
            .order("updated_at", { ascending: false });

          if (error) throw error;

          // Also get default branch from repositories table
          const { data: repo } = await supabase
            .from("repositories")
            .select("default_branch, head_sha")
            .eq("id", repoId)
            .single();

          const defaultBranch = repo?.default_branch || "main";
          const branches = (refs || []).map((r: any) => ({
            name: r.name.replace(/^refs\/heads\//, ""),
            ref: r.name,
            sha: r.sha,
            updatedAt: r.updated_at,
            isDefault: r.name.replace(/^refs\/heads\//, "") === defaultBranch,
          }));

          // If no refs table entries exist yet, include default branch with head_sha
          if (branches.length === 0 && repo) {
            branches.push({
              name: defaultBranch,
              ref: `refs/heads/${defaultBranch}`,
              sha: repo.head_sha || "HEAD",
              updatedAt: new Date().toISOString(),
              isDefault: true,
            });
          }

          return new Response(JSON.stringify({ branches }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
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
          const authHeader = request.headers.get("authorization");
          if (!authHeader) {
            return new Response(JSON.stringify({ error: "Authentication required" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

          const supabase = getSupabaseAdmin();
          const token = authHeader.replace(/^Bearer\s+/i, "").trim();
          const { data: userData, error: authError } = await supabase.auth.getUser(token);
          if (authError || !userData?.user) {
            return new Response(JSON.stringify({ error: "Invalid token" }), {
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
          const refName = `refs/heads/${cleanName}`;

          // Get head sha if fromSha not provided
          let targetSha = fromSha;
          if (!targetSha) {
            const { data: repo } = await supabase
              .from("repositories")
              .select("head_sha")
              .eq("id", repoId)
              .single();
            targetSha = repo?.head_sha || "initial";
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
