// src/routes/api/orgs/sso.ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { logAuditEvent } from "@/lib/audit.server";
import { getActor } from "@/lib/authz.server";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    },
  });

export const Route = createFileRoute("/api/orgs/sso")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const actor = await getActor(request);
        if (!actor) return json({ error: "Unauthorized" }, 401);

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

        // Verify caller is a member of this organisation
        const { data: membership } = await supabase
          .from("org_members" as any)
          .select("role")
          .eq("org_id", (org as any).id)
          .eq("user_id", actor.userId)
          .maybeSingle();

        if (!membership) {
          return json({ error: "Organization membership required" }, 403);
        }

        const { data: sso } = await supabase
          .from("org_sso_configs" as any)
          .select("id, provider, issuer, client_id, sso_url, is_enforced, updated_at")
          .eq("org_id", (org as any).id)
          .maybeSingle();

        // Never expose raw certificate material
        return json({ sso: sso || null });
      },

      POST: async ({ request }) => {
        const actor = await getActor(request);
        if (!actor) return json({ error: "Unauthorized" }, 401);

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

        const supabase = getSupabaseAdmin();
        const { data: org } = await supabase
          .from("orgs" as any)
          .select("id")
          .eq("slug", orgSlug)
          .maybeSingle();

        if (!org) return json({ error: "Organization not found" }, 404);

        // Verify requester is owner
        const { data: requester } = await supabase
          .from("org_members" as any)
          .select("role")
          .eq("org_id", (org as any).id)
          .eq("user_id", actor.userId)
          .maybeSingle();

        if (!requester || (requester as any).role !== "owner") {
          return json({ error: "Only organization owners can configure SSO" }, 403);
        }

        const { data: ssoConfig, error: upsertError } = await supabase
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
          .select("id, provider, issuer, client_id, sso_url, is_enforced, updated_at")
          .single();

        if (upsertError) return json({ error: upsertError.message }, 500);

        await logAuditEvent({
          orgId: (org as any).id,
          actorId: actor.userId,
          action: "org.sso_configured",
          targetType: "org",
          targetId: (org as any).id,
          metadata: { provider, isEnforced },
          req: request,
        });

        return json({ sso: ssoConfig });
      },
    },
  },
});
