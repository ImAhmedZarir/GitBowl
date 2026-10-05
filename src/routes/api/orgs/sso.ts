// src/routes/api/orgs/sso.ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { logAuditEvent } from "@/lib/audit.server";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const Route = createFileRoute("/api/orgs/sso")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const orgSlug = url.searchParams.get("orgSlug")?.trim().toLowerCase();
        if (!orgSlug) return json({ error: "orgSlug is required" }, 400);

        const supabase = getSupabaseAdmin();
        const { data: org } = await supabase
          .from("orgs" as any)
          .select("id")
          .eq("slug", orgSlug)
          .maybeSingle();

        if (!org) return json({ error: "Organization not found" }, 404);

        const { data: sso } = await supabase
          .from("org_sso_configs" as any)
          .select("id, provider, issuer, client_id, sso_url, is_enforced, updated_at")
          .eq("org_id", (org as any).id)
          .maybeSingle();

        return json({ sso: sso || null });
      },

      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
        const token = authHeader.slice(7);

        const supabase = getSupabaseAdmin();
        const { data: userData } = await supabase.auth.getUser(token);
        if (!userData?.user) return json({ error: "Unauthorized" }, 401);

        const body = await request.json().catch(() => ({}));
        const {
          orgSlug,
          provider = "oidc",
          issuer = "",
          clientId = "",
          ssoUrl = "",
          certificate = "",
          isEnforced = false,
        } = body;

        const { data: org } = await supabase
          .from("orgs" as any)
          .select("id")
          .eq("slug", orgSlug)
          .maybeSingle();

        if (!org) return json({ error: "Organization not found" }, 404);

        const { data: requester } = await supabase
          .from("org_members" as any)
          .select("role")
          .eq("org_id", (org as any).id)
          .eq("user_id", userData.user.id)
          .maybeSingle();

        if (!requester || !["owner", "admin"].includes((requester as any).role)) {
          return json({ error: "Forbidden" }, 403);
        }

        const { data: config, error } = await supabase
          .from("org_sso_configs" as any)
          .upsert(
            {
              org_id: (org as any).id,
              provider,
              issuer,
              client_id: clientId,
              sso_url: ssoUrl,
              certificate,
              is_enforced: isEnforced,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "org_id" },
          )
          .select()
          .single();

        if (error) return json({ error: error.message }, 500);

        await logAuditEvent({
          orgId: (org as any).id,
          actorId: userData.user.id,
          action: "sso.config_change",
          targetType: "sso_config",
          targetId: (config as any).id,
          metadata: { provider, isEnforced },
          req: request,
        });

        return json({ sso: config });
      },
    },
  },
});
