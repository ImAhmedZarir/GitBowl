// src/routes/api/repo/pages-config.ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { getActor, requireRepoAccess } from "@/lib/authz.server";

export const Route = createFileRoute("/api/repo/pages-config")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const actor = await getActor(request);
          if (!actor) {
            return new Response(JSON.stringify({ error: "Authentication required" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

          const url = new URL(request.url);
          const repoId = url.searchParams.get("repoId");
          if (!repoId) {
            return new Response(JSON.stringify({ error: "Missing repoId" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const supabase = getSupabaseAdmin();
          const { data: repo } = await supabase
            .from("repositories")
            .select("id, is_private, owner_id, org_id")
            .eq("id", repoId)
            .maybeSingle();

          if (!repo) {
            return new Response(JSON.stringify({ error: "Repository not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          const access = await requireRepoAccess(actor, repo, "read");
          if (!access.allowed) {
            return new Response(JSON.stringify({ error: "Access denied" }), {
              status: access.status || 403,
              headers: { "Content-Type": "application/json" },
            });
          }

          const { data: config, error } = await supabase
            .from("pages_config" as any)
            .select("id, is_enabled, branch, path, custom_domain, status, updated_at")
            .eq("repo_id", repoId)
            .maybeSingle();

          if (error) throw error;

          return new Response(
            JSON.stringify({
              config: config || {
                is_enabled: false,
                branch: "main",
                path: "/",
                status: "ready",
              },
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "private, no-store",
              },
            },
          );
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: err.message || "Failed to fetch pages config" }),
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
          const { repoId, isEnabled, branch = "main", path = "/" } = body;

          if (!repoId) {
            return new Response(JSON.stringify({ error: "Missing repoId" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const supabase = getSupabaseAdmin();
          const { data: repo } = await supabase
            .from("repositories")
            .select("id, is_private, owner_id, org_id")
            .eq("id", repoId)
            .maybeSingle();

          if (!repo) {
            return new Response(JSON.stringify({ error: "Repository not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          const access = await requireRepoAccess(actor, repo, "admin");
          if (!access.allowed) {
            return new Response(JSON.stringify({ error: "Only repository administrators can configure Pages" }), {
              status: 403,
              headers: { "Content-Type": "application/json" },
            });
          }

          const { data: updatedConfig, error: upsertError } = await supabase
            .from("pages_config" as any)
            .upsert(
              {
                repo_id: repoId,
                is_enabled: Boolean(isEnabled),
                branch: (branch || "main").trim(),
                path: (path || "/").trim(),
                status: isEnabled ? "building" : "ready",
                updated_at: new Date().toISOString(),
              },
              { onConflict: "repo_id" },
            )
            .select()
            .single();

          if (upsertError) throw upsertError;

          return new Response(JSON.stringify({ config: updatedConfig }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: err.message || "Failed to update pages config" }),
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
