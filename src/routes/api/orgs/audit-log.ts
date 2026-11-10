// src/routes/api/orgs/audit-log.ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { getActor } from "@/lib/authz.server";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function sanitizeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  // Defeat CSV formula injection: if first char is =, +, -, @, \t, \r, prefix with single quote
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

export const Route = createFileRoute("/api/orgs/audit-log")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const actor = await getActor(request);
        if (!actor) return json({ error: "Unauthorized" }, 401);

        const url = new URL(request.url);
        const orgSlug = url.searchParams.get("orgSlug")?.trim().toLowerCase();
        const actionFilter = url.searchParams.get("action")?.trim();
        const actorFilter = url.searchParams.get("actor")?.trim();
        const format = url.searchParams.get("format") || "json";

        if (!orgSlug) return json({ error: "orgSlug is required" }, 400);

        const supabase = getSupabaseAdmin();
        const { data: org } = await supabase
          .from("orgs" as any)
          .select("id, name, slug")
          .eq("slug", orgSlug)
          .maybeSingle();

        if (!org) return json({ error: "Organization not found" }, 404);

        // Verify owner/admin
        const { data: requester } = await supabase
          .from("org_members" as any)
          .select("role")
          .eq("org_id", (org as any).id)
          .eq("user_id", actor.userId)
          .maybeSingle();

        if (!requester || !["owner", "admin"].includes((requester as any).role)) {
          return json({ error: "Forbidden: Org admin required" }, 403);
        }

        let query = supabase
          .from("audit_logs" as any)
          .select(
            "id, action, target_type, target_id, ip_address, user_agent, metadata, created_at, actor:actor_id (id, username)",
          )
          .eq("org_id", (org as any).id)
          .order("created_at", { ascending: false })
          .limit(200);

        if (actionFilter) {
          query = query.eq("action", actionFilter);
        }

        if (actorFilter) {
          query = query.eq("actor_id", actorFilter);
        }

        const { data: logs, error } = await query;
        if (error) return json({ error: error.message }, 500);

        if (format === "csv") {
          const rows: string[] = [
            "id,created_at,actor_username,action,target_type,target_id,ip_address,metadata",
          ];
          for (const l of logs || []) {
            const metaStr = JSON.stringify((l as any).metadata || {});
            rows.push(
              [
                sanitizeCsvCell((l as any).id),
                sanitizeCsvCell((l as any).created_at),
                sanitizeCsvCell((l as any).actor?.username || ""),
                sanitizeCsvCell((l as any).action),
                sanitizeCsvCell((l as any).target_type || ""),
                sanitizeCsvCell((l as any).target_id || ""),
                sanitizeCsvCell((l as any).ip_address || ""),
                sanitizeCsvCell(metaStr),
              ].join(","),
            );
          }

          return new Response(rows.join("\n"), {
            status: 200,
            headers: {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": `attachment; filename="${orgSlug}-audit-log.csv"`,
              "X-Content-Type-Options": "nosniff",
            },
          });
        }

        return json({ logs: logs || [] });
      },
    },
  },
});
