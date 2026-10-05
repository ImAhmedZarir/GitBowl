// src/routes/api/orgs/index.ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { isReservedUsername } from "@/lib/reserved-usernames";
import { logAuditEvent } from "@/lib/audit.server";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const Route = createFileRoute("/api/orgs/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return json({ error: "Unauthorized" }, 401);
        }

        const token = authHeader.slice(7);
        const supabase = getSupabaseAdmin();
        const { data: userData, error: authError } = await supabase.auth.getUser(token);
        if (authError || !userData.user) return json({ error: "Unauthorized" }, 401);

        // Fetch user's organizations
        const { data: memberships } = await supabase
          .from("org_members" as any)
          .select(
            "org_id, role, orgs:org_id (id, name, slug, display_name, description, avatar_url, plan)",
          )
          .eq("user_id", userData.user.id);

        const orgs = (memberships || [])
          .map((m: any) => ({
            ...m.orgs,
            role: m.role,
          }))
          .filter(Boolean);

        return json({ orgs });
      },

      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return json({ error: "Unauthorized" }, 401);
        }

        const token = authHeader.slice(7);
        const supabase = getSupabaseAdmin();
        const { data: userData, error: authError } = await supabase.auth.getUser(token);
        if (authError || !userData.user) return json({ error: "Unauthorized" }, 401);

        const body = await request.json().catch(() => ({}));
        const name = (body.name || "").trim();
        const rawSlug = (body.slug || body.name || "").trim().toLowerCase();
        const slug = rawSlug.replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
        const description = (body.description || "").trim();
        const displayName = (body.display_name || name).trim();

        if (!name || !slug) {
          return json({ error: "Organization name and slug are required" }, 400);
        }

        if (slug.length < 3 || slug.length > 39) {
          return json({ error: "Slug must be between 3 and 39 characters" }, 400);
        }

        if (isReservedUsername(slug)) {
          return json({ error: `'${slug}' is a reserved namespace` }, 400);
        }

        // Check collision with user profiles
        const { data: existingUser } = await supabase
          .from("profiles")
          .select("id")
          .ilike("username", slug)
          .maybeSingle();

        if (existingUser) {
          return json({ error: "This namespace is already taken by an existing user" }, 409);
        }

        // Check collision with other orgs
        const { data: existingOrg } = await supabase
          .from("orgs" as any)
          .select("id")
          .ilike("slug", slug)
          .maybeSingle();

        if (existingOrg) {
          return json({ error: "Organization slug already taken" }, 409);
        }

        // Create org
        const { data: newOrg, error: orgError } = await supabase
          .from("orgs" as any)
          .insert({
            name,
            slug,
            display_name: displayName,
            description,
            plan: "free",
          })
          .select()
          .single();

        if (orgError || !newOrg) {
          return json({ error: orgError?.message || "Failed to create organization" }, 500);
        }

        // Add creator as owner
        const { error: memberError } = await supabase.from("org_members" as any).insert({
          org_id: (newOrg as any).id,
          user_id: userData.user.id,
          role: "owner",
        });

        if (memberError) {
          console.warn("[Orgs] Failed to attach owner:", memberError);
        }

        // Record audit event
        await logAuditEvent({
          orgId: (newOrg as any).id,
          actorId: userData.user.id,
          action: "org.create",
          targetType: "org",
          targetId: (newOrg as any).id,
          metadata: { slug, name },
          req: request,
        });

        return json({ org: newOrg }, 201);
      },
    },
  },
});
