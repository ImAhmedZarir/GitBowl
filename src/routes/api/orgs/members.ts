// src/routes/api/orgs/members.ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { logAuditEvent } from "@/lib/audit.server";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const Route = createFileRoute("/api/orgs/members")({
  server: {
    handlers: {
      GET: async ({ request }) => {
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

        const { data: members, error } = await supabase
          .from("org_members" as any)
          .select("id, role, created_at, user:user_id (id, username, display_name, avatar_url)")
          .eq("org_id", (org as any).id);

        if (error) return json({ error: error.message }, 500);
        return json({ members: members || [] });
      },

      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
        const token = authHeader.slice(7);

        const supabase = getSupabaseAdmin();
        const { data: userData, error: authError } = await supabase.auth.getUser(token);
        if (authError || !userData.user) return json({ error: "Unauthorized" }, 401);

        const body = await request.json().catch(() => ({}));
        const orgSlug = body.orgSlug?.trim().toLowerCase();
        const targetUsername = body.username?.trim();
        const role = body.role || "member";

        if (!orgSlug || !targetUsername) {
          return json({ error: "orgSlug and username are required" }, 400);
        }

        const { data: org } = await supabase
          .from("orgs" as any)
          .select("id, name, slug")
          .eq("slug", orgSlug)
          .maybeSingle();

        if (!org) return json({ error: "Organization not found" }, 404);

        // Check if requester is owner/admin
        const { data: requesterMember } = await supabase
          .from("org_members" as any)
          .select("role")
          .eq("org_id", (org as any).id)
          .eq("user_id", userData.user.id)
          .maybeSingle();

        if (!requesterMember || !["owner", "admin"].includes((requesterMember as any).role)) {
          return json({ error: "Only org owners and admins can add members" }, 403);
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
          actorId: userData.user.id,
          action: "org.member_add",
          targetType: "user",
          targetId: targetProfile.id,
          metadata: { username: targetProfile.username, role },
          req: request,
        });

        return json({ member: newMember });
      },

      PATCH: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
        const token = authHeader.slice(7);

        const supabase = getSupabaseAdmin();
        const { data: userData } = await supabase.auth.getUser(token);
        if (!userData?.user) return json({ error: "Unauthorized" }, 401);

        const body = await request.json().catch(() => ({}));
        const { orgSlug, userId, role } = body;

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
          .eq("user_id", userData.user.id)
          .maybeSingle();

        if (!requester || (requester as any).role !== "owner") {
          return json({ error: "Only owners can change member roles" }, 403);
        }

        await supabase
          .from("org_members" as any)
          .update({ role })
          .eq("org_id", (org as any).id)
          .eq("user_id", userId);

        await logAuditEvent({
          orgId: (org as any).id,
          actorId: userData.user.id,
          action: "org.role_change",
          targetType: "user",
          targetId: userId,
          metadata: { newRole: role },
          req: request,
        });

        return json({ success: true });
      },

      DELETE: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
        const token = authHeader.slice(7);

        const supabase = getSupabaseAdmin();
        const { data: userData } = await supabase.auth.getUser(token);
        if (!userData?.user) return json({ error: "Unauthorized" }, 401);

        const url = new URL(request.url);
        const orgSlug = url.searchParams.get("orgSlug");
        const userId = url.searchParams.get("userId");

        if (!orgSlug || !userId) return json({ error: "Missing parameters" }, 400);

        const { data: org } = await supabase
          .from("orgs" as any)
          .select("id")
          .eq("slug", orgSlug)
          .maybeSingle();

        if (!org) return json({ error: "Organization not found" }, 404);

        // Verify requester permissions (or self-removal)
        if (userData.user.id !== userId) {
          const { data: requester } = await supabase
            .from("org_members" as any)
            .select("role")
            .eq("org_id", (org as any).id)
            .eq("user_id", userData.user.id)
            .maybeSingle();

          if (!requester || !["owner", "admin"].includes((requester as any).role)) {
            return json({ error: "Forbidden" }, 403);
          }
        }

        await supabase
          .from("org_members" as any)
          .delete()
          .eq("org_id", (org as any).id)
          .eq("user_id", userId);

        await logAuditEvent({
          orgId: (org as any).id,
          actorId: userData.user.id,
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
