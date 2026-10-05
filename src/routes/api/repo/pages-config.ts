// src/routes/api/repo/pages-config.ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/repo/pages-config")({
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
            { status: 200, headers: { "Content-Type": "application/json" } },
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
          const authHeader = request.headers.get("authorization");
          if (!authHeader) {
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
          const cleanPath = path.startsWith("/") ? path : `/${path}`;

          const { data: updated, error } = await supabase
            .from("pages_config" as any)
            .upsert(
              {
                repo_id: repoId,
                is_enabled: !!isEnabled,
                branch: branch.trim(),
                path: cleanPath,
                status: "ready",
                updated_at: new Date().toISOString(),
              },
              { onConflict: "repo_id" },
            )
            .select("id, is_enabled, branch, path, status, updated_at")
            .single();

          if (error) throw error;

          return new Response(JSON.stringify({ config: updated }), {
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
