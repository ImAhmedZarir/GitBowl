// src/routes/api/orgs/teams.ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { logAuditEvent } from "@/lib/audit.server";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const Route = createFileRoute("/api/orgs/teams")({
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

        const { data: teams, error } = await supabase
          .from("teams" as any)
          .select(
            "*, members:team_members(count), permissions:team_repo_permissions(repo_id, permission)",
          )
          .eq("org_id", (org as any).id);

        if (error) return json({ error: error.message }, 500);
        return json({ teams: teams || [] });
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
          name,
          description = "",
          privacy = "visible",
          action = "create_team",
        } = body;

        const { data: org } = await supabase
          .from("orgs" as any)
          .select("id")
          .eq("slug", orgSlug)
          .maybeSingle();

        if (!org) return json({ error: "Organization not found" }, 404);

        // Verify owner/admin role
        const { data: requester } = await supabase
          .from("org_members" as any)
          .select("role")
          .eq("org_id", (org as any).id)
          .eq("user_id", userData.user.id)
          .maybeSingle();

        if (!requester || !["owner", "admin"].includes((requester as any).role)) {
          return json({ error: "Forbidden: Org admin required" }, 403);
        }

        if (action === "create_team") {
          const rawSlug = (body.slug || name || "").trim().toLowerCase();
          const slug = rawSlug.replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");

          if (!name || !slug) return json({ error: "Team name and slug required" }, 400);

          const { data: newTeam, error } = await supabase
            .from("teams" as any)
            .insert({
              org_id: (org as any).id,
              name,
              slug,
              description,
              privacy,
            })
            .select()
            .single();

          if (error) return json({ error: error.message }, 500);

          await logAuditEvent({
            orgId: (org as any).id,
            actorId: userData.user.id,
            action: "team.create",
            targetType: "team",
            targetId: (newTeam as any).id,
            metadata: { name, slug },
            req: request,
          });

          return json({ team: newTeam }, 201);
        }

        if (action === "add_member") {
          const { teamId, targetUsername, role = "member" } = body;
          const { data: targetProfile } = await supabase
            .from("profiles")
            .select("id, username")
            .ilike("username", targetUsername)
            .maybeSingle();

          if (!targetProfile) return json({ error: "User not found" }, 404);

          const { error } = await supabase.from("team_members" as any).upsert(
            {
              team_id: teamId,
              user_id: targetProfile.id,
              role,
            },
            { onConflict: "team_id,user_id" },
          );

          if (error) return json({ error: error.message }, 500);

          await logAuditEvent({
            orgId: (org as any).id,
            actorId: userData.user.id,
            action: "team.member_add",
            targetType: "user",
            targetId: targetProfile.id,
            metadata: { teamId, username: targetProfile.username, role },
            req: request,
          });

          return json({ success: true });
        }

        if (action === "assign_permission") {
          const { teamId, repoId, permission = "write" } = body;
          const { error } = await supabase.from("team_repo_permissions" as any).upsert(
            {
              team_id: teamId,
              repo_id: repoId,
              permission,
            },
            { onConflict: "team_id,repo_id" },
          );

          if (error) return json({ error: error.message }, 500);

          await logAuditEvent({
            orgId: (org as any).id,
            actorId: userData.user.id,
            action: "team.repo_permission_change",
            targetType: "repository",
            targetId: repoId,
            metadata: { teamId, permission },
            req: request,
          });

          return json({ success: true });
        }

        return json({ error: "Invalid action" }, 400);
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
        const teamId = url.searchParams.get("teamId");

        if (!orgSlug || !teamId) return json({ error: "Missing parameters" }, 400);

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

        await supabase
          .from("teams" as any)
          .delete()
          .eq("id", teamId);

        await logAuditEvent({
          orgId: (org as any).id,
          actorId: userData.user.id,
          action: "team.delete",
          targetType: "team",
          targetId: teamId,
          req: request,
        });

        return json({ success: true });
      },
    },
  },
});
