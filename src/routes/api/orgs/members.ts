// src/routes/api/orgs/members.ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { logAuditEvent } from "@/lib/audit.server";
import { getActor } from "@/lib/authz.server";

const VALID_ROLES = ["owner", "admin", "member", "billing"];

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    },
  });

export const Route = createFileRoute("/api/orgs/members")({
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
          .select("id, name, slug")
          .eq("slug", orgSlug)
          .maybeSingle();

        if (!org) return json({ error: "Organization not found" }, 404);

        // Verify membership
        const { data: requesterMember } = await supabase
          .from("org_members" as any)
          .select("role")
          .eq("org_id", (org as any).id)
          .eq("user_id", actor.userId)
          .maybeSingle();

        if (!requesterMember) {
          return json({ error: "Organization membership required" }, 403);
        }

        const { data: members, error } = await supabase
          .from("org_members" as any)
          .select("id, role, created_at, user:user_id (id, username, display_name, avatar_url)")
          .eq("org_id", (org as any).id);

        if (error) return json({ error: error.message }, 500);
        return json({ members: members || [] });
      },

      POST: async ({ request }) => {
        const actor = await getActor(request);
        if (!actor) return json({ error: "Unauthorized" }, 401);

        const body = await request.json().catch(() => ({}));
        const orgSlug = body.orgSlug?.trim().toLowerCase();
        const targetUsername = body.username?.trim();
        const role = (body.role || "member").toLowerCase();

        if (!orgSlug || !targetUsername) {
          return json({ error: "orgSlug and username are required" }, 400);
        }

        if (!VALID_ROLES.includes(role)) {
          return json(
            { error: `Invalid role. Permitted roles are: ${VALID_ROLES.join(", ")}` },
            400,
          );
        }

        const supabase = getSupabaseAdmin();
        const { data: org } = await supabase
          .from("orgs" as any)
          .select("id, name, slug")
          .eq("slug", orgSlug)
          .maybeSingle();

        if (!org) return json({ error: "Organization not found" }, 404);

        // Check requester's role
        const { data: requesterMember } = await supabase
          .from("org_members" as any)
          .select("role")
          .eq("org_id", (org as any).id)
          .eq("user_id", actor.userId)
          .maybeSingle();

        if (!requesterMember || !["owner", "admin"].includes((requesterMember as any).role)) {
          return json({ error: "Only org owners and admins can add members" }, 403);
        }

        // Privilege escalation defense: Only owners can create or promote owners
        if (role === "owner" && (requesterMember as any).role !== "owner") {
          return json({ error: "Only existing organization owners can grant the owner role" }, 403);
        }

        // Find user by username
        const { data: targetProfile } = await supabase
          .from("profiles")
          .select("id, username")
          .ilike("username", targetUsername)
          .maybeSingle();

        if (!targetProfile) {
          return json({ error: `User '${targetUsername}' not found` }, 404);
        }

        // Add member
        const { data: newMember, error: insertError } = await supabase
          .from("org_members" as any)
          .upsert(
            {
              org_id: (org as any).id,
              user_id: targetProfile.id,
              role,
            },
            { onConflict: "org_id,user_id" },
          )
          .select()
          .single();

        if (insertError) return json({ error: insertError.message }, 500);

        // Audit log
        await logAuditEvent({
          orgId: (org as any).id,
          actorId: actor.userId,
          action: "org.member_add",
          targetType: "user",
          targetId: targetProfile.id,
          metadata: { username: targetProfile.username, role },
          req: request,
        });

        return json({ member: newMember });
      },

      PATCH: async ({ request }) => {
        const actor = await getActor(request);
        if (!actor) return json({ error: "Unauthorized" }, 401);

        const body = await request.json().catch(() => ({}));
        const { orgSlug, userId, role: newRoleRaw } = body;
        const role = (newRoleRaw || "").toLowerCase();

        if (!VALID_ROLES.includes(role)) {
          return json(
            { error: `Invalid role. Permitted roles are: ${VALID_ROLES.join(", ")}` },
            400,
          );
        }

        const supabase = getSupabaseAdmin();
        const { data: org } = await supabase
          .from("orgs" as any)
          .select("id")
          .eq("slug", orgSlug)
          .maybeSingle();

        if (!org) return json({ error: "Organization not found" }, 404);

        // Verify requester role
        const { data: requester } = await supabase
          .from("org_members" as any)
          .select("role")
          .eq("org_id", (org as any).id)
          .eq("user_id", actor.userId)
          .maybeSingle();

        if (!requester || (requester as any).role !== "owner") {
          return json({ error: "Only owners can change member roles" }, 403);
        }

        // Target user current role
        const { data: targetMember } = await supabase
          .from("org_members" as any)
          .select("role")
          .eq("org_id", (org as any).id)
          .eq("user_id", userId)
          .maybeSingle();

        if (!targetMember) {
          return json({ error: "Target member not found" }, 404);
        }

        // Guard: Block demoting the last owner
        if ((targetMember as any).role === "owner" && role !== "owner") {
          const { count } = await supabase
            .from("org_members" as any)
            .select("id", { count: "exact", head: true })
            .eq("org_id", (org as any).id)
            .eq("role", "owner");

          if (count !== null && count <= 1) {
            return json({ error: "Cannot demote the last owner of the organization" }, 400);
          }
        }

        await supabase
          .from("org_members" as any)
          .update({ role })
          .eq("org_id", (org as any).id)
          .eq("user_id", userId);

        await logAuditEvent({
          orgId: (org as any).id,
          actorId: actor.userId,
          action: "org.role_change",
          targetType: "user",
          targetId: userId,
          metadata: { newRole: role },
          req: request,
        });

        return json({ success: true });
      },

      DELETE: async ({ request }) => {
        const actor = await getActor(request);
        if (!actor) return json({ error: "Unauthorized" }, 401);

        const url = new URL(request.url);
        const orgSlug = url.searchParams.get("orgSlug");
        const userId = url.searchParams.get("userId");

        if (!orgSlug || !userId) return json({ error: "Missing parameters" }, 400);

        const supabase = getSupabaseAdmin();
        const { data: org } = await supabase
          .from("orgs" as any)
          .select("id")
          .eq("slug", orgSlug)
          .maybeSingle();

        if (!org) return json({ error: "Organization not found" }, 404);

        // Target user current membership
        const { data: targetMember } = await supabase
          .from("org_members" as any)
          .select("role")
          .eq("org_id", (org as any).id)
          .eq("user_id", userId)
          .maybeSingle();

        if (!targetMember) return json({ error: "Member not found" }, 404);

        // Verify requester permissions (or self-removal)
        if (actor.userId !== userId) {
          const { data: requester } = await supabase
            .from("org_members" as any)
            .select("role")
            .eq("org_id", (org as any).id)
            .eq("user_id", actor.userId)
            .maybeSingle();

          if (!requester || !["owner", "admin"].includes((requester as any).role)) {
            return json({ error: "Forbidden" }, 403);
          }

          // Admins CANNOT delete owners
          if ((targetMember as any).role === "owner" && (requester as any).role !== "owner") {
            return json({ error: "Organization admins cannot remove an owner" }, 403);
          }
        }

        // Guard: Block removing the last owner
        if ((targetMember as any).role === "owner") {
          const { count } = await supabase
            .from("org_members" as any)
            .select("id", { count: "exact", head: true })
            .eq("org_id", (org as any).id)
            .eq("role", "owner");

          if (count !== null && count <= 1) {
            return json({ error: "Cannot remove the last owner of the organization" }, 400);
          }
        }

        await supabase
          .from("org_members" as any)
          .delete()
          .eq("org_id", (org as any).id)
          .eq("user_id", userId);

        await logAuditEvent({
          orgId: (org as any).id,
          actorId: actor.userId,
          action: "org.member_remove",
          targetType: "user",
          targetId: userId,
          req: request,
        });

        return json({ success: true });
      },
    },
  },
});
