// src/routes/api/admin/repos.ts
import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin, recordAuditLog } from "@/lib/admin.server";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/admin/repos")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireAdmin(request);
          const url = new URL(request.url);
          const search = (url.searchParams.get("search") || "").trim().toLowerCase();
          const supabase = getSupabaseAdmin();

          let reposList: any[] = [];
          const { data: rawRepos, error: repoErr } = await supabase
            .from("repositories")
            .select(
              "id, name, description, is_private, default_branch, stars_count, forks_count, created_at, updated_at, owner_id",
            )
            .ilike("name", search ? `%${search}%` : "%")
            .order("created_at", { ascending: false })
            .limit(50);

          if (repoErr) throw repoErr;

          if (rawRepos && rawRepos.length > 0) {
            const ownerIds = [...new Set(rawRepos.map((r) => r.owner_id))];
            const { data: owners } = await supabase
              .from("profiles")
              .select("id, username, display_name")
              .in("id", ownerIds);
            const ownerMap = new Map((owners || []).map((o: any) => [o.id, o]));

            reposList = rawRepos.map((r) => ({
              ...r,
              profiles: ownerMap.get(r.owner_id) || { username: "unknown", display_name: null },
            }));
          }

          return new Response(JSON.stringify({ repos: reposList }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          if (err instanceof Response) return err;
          return new Response(
            JSON.stringify({ error: err.message || "Failed to fetch repositories" }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      },

      POST: async ({ request }) => {
        try {
          const admin = await requireAdmin(request);
          const body = await request.json().catch(() => ({}));
          const { repoId, action } = body;

          if (!repoId) {
            return new Response(JSON.stringify({ error: "Missing repoId" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const supabase = getSupabaseAdmin();

          if (action === "delete_repo") {
            const { data: repo } = await supabase
              .from("repositories")
              .select("name, owner_id")
              .eq("id", repoId)
              .single();

            const { error } = await supabase.from("repositories").delete().eq("id", repoId);

            if (error) throw error;

            await recordAuditLog({
              actorId: admin.id,
              action: "admin.delete_repository",
              targetType: "repository",
              targetId: repoId,
              metadata: { name: repo?.name, owner_id: repo?.owner_id },
              ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
            });

            return new Response(JSON.stringify({ success: true }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          return new Response(JSON.stringify({ error: "Unknown action" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          if (err instanceof Response) return err;
          return new Response(
            JSON.stringify({ error: err.message || "Failed to process repository action" }),
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
