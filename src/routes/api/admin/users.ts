// src/routes/api/admin/users.ts
import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin, recordAuditLog } from "@/lib/admin.server";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/admin/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireAdmin(request);
          const url = new URL(request.url);
          const search = (url.searchParams.get("search") || "").trim().toLowerCase();
          const supabase = getSupabaseAdmin();

          let query = supabase
            .from("profiles")
            .select("id, username, display_name, bio, role, is_suspended, created_at")
            .order("created_at", { ascending: false })
            .limit(50);

          if (search) {
            query = query.or(`username.ilike.%${search}%,display_name.ilike.%${search}%`);
          }

          const { data: users, error } = await query;
          if (error) throw error;

          // Fetch repo counts per user
          const { data: repos } = await supabase.from("repositories").select("owner_id");

          const repoCounts: Record<string, number> = {};
          if (repos) {
            for (const r of repos) {
              repoCounts[r.owner_id] = (repoCounts[r.owner_id] || 0) + 1;
            }
          }

          const enriched = (users || []).map((u: any) => ({
            ...u,
            repoCount: repoCounts[u.id] || 0,
          }));

          return new Response(JSON.stringify({ users: enriched }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          if (err instanceof Response) return err;
          return new Response(JSON.stringify({ error: err.message || "Failed to fetch users" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },

      POST: async ({ request }) => {
        try {
          const admin = await requireAdmin(request);
          const body = await request.json().catch(() => ({}));
          const { userId, action, role } = body;

          if (!userId) {
            return new Response(JSON.stringify({ error: "Missing userId" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const supabase = getSupabaseAdmin();

          if (action === "toggle_suspend") {
            const { data: targetUser } = await supabase
              .from("profiles")
              .select("is_suspended")
              .eq("id", userId)
              .single();

            const nextSuspended = !targetUser?.is_suspended;
            const { error } = await supabase
              .from("profiles")
              .update({ is_suspended: nextSuspended } as any)
              .eq("id", userId);

            if (error) throw error;

            await recordAuditLog({
              actorId: admin.id,
              action: nextSuspended ? "admin.suspend_user" : "admin.unsuspend_user",
              targetType: "user",
              targetId: userId,
              metadata: { nextSuspended },
              ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
            });

            return new Response(JSON.stringify({ success: true, is_suspended: nextSuspended }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (action === "change_role" && role) {
            if (!["user", "admin", "staff"].includes(role)) {
              return new Response(JSON.stringify({ error: "Invalid role" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
              });
            }

            const { error } = await supabase
              .from("profiles")
              .update({ role } as any)
              .eq("id", userId);

            if (error) throw error;

            await recordAuditLog({
              actorId: admin.id,
              action: "admin.change_user_role",
              targetType: "user",
              targetId: userId,
              metadata: { newRole: role },
              ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
            });

            return new Response(JSON.stringify({ success: true, role }), {
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
          return new Response(JSON.stringify({ error: err.message || "Failed to update user" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
