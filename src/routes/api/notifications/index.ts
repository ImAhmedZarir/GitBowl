// src/routes/api/notifications/index.ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { getUserNotifications } from "@/lib/notifications.server";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const Route = createFileRoute("/api/notifications/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return json({ error: "Unauthorized" }, 401);
        }
        const token = authHeader.slice(7).trim();
        const supabase = getSupabaseAdmin();

        const { data: userData, error: authError } = await supabase.auth.getUser(token);
        if (authError || !userData?.user) {
          return json({ error: "Unauthorized" }, 401);
        }

        const result = await getUserNotifications(userData.user.id);
        return json(result, 200);
      },

      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return json({ error: "Unauthorized" }, 401);
        }
        const token = authHeader.slice(7).trim();
        const supabase = getSupabaseAdmin();

        const { data: userData, error: authError } = await supabase.auth.getUser(token);
        if (authError || !userData?.user) {
          return json({ error: "Unauthorized" }, 401);
        }

        const body = await request.json().catch(() => ({}));
        const { action, notificationId } = body;
        const userId = userData.user.id;

        if (action === "mark_read" && notificationId) {
          await supabase
            .from("notifications" as any)
            .update({ is_read: true })
            .eq("id", notificationId)
            .eq("user_id", userId);
          return json({ success: true }, 200);
        }

        if (action === "mark_all_read") {
          await supabase
            .from("notifications" as any)
            .update({ is_read: true })
            .eq("user_id", userId)
            .eq("is_read", false);
          return json({ success: true }, 200);
        }

        if (action === "clear_all") {
          await supabase
            .from("notifications" as any)
            .delete()
            .eq("user_id", userId);
          return json({ success: true }, 200);
        }

        return json({ error: "Invalid action" }, 400);
      },
    },
  },
});
