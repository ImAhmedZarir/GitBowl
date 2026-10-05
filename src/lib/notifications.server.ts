// src/lib/notifications.server.ts
// Central Server-side Notifications Engine for GitBowl
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";

export interface NotificationItem {
  id: string;
  user_id: string;
  type: "star" | "fork" | "issue" | "pr" | "commit" | "sync" | "admin" | "system";
  title: string;
  content: string;
  link: string;
  is_read: boolean;
  actor_id?: string | null;
  created_at: string;
  actor?: {
    username: string;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
}

/**
 * Creates a persistent notification for a user.
 */
export async function createNotification(params: {
  userId: string;
  type: "star" | "fork" | "issue" | "pr" | "commit" | "sync" | "admin" | "system";
  title: string;
  content?: string;
  link?: string;
  actorId?: string | null;
}): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("notifications" as any)
      .insert({
        user_id: params.userId,
        type: params.type,
        title: params.title,
        content: params.content || "",
        link: params.link || "/",
        actor_id: params.actorId || null,
        is_read: false,
      })
      .select("id")
      .single();

    if (error) {
      console.warn("[Notifications] Failed to insert notification:", error.message);
      return null;
    }
    return (data as any)?.id || null;
  } catch (err) {
    console.warn("[Notifications] Error creating notification:", err);
    return null;
  }
}

/**
 * Retrieves notifications for an authenticated user with unread count.
 */
export async function getUserNotifications(
  userId: string,
  limit = 30,
): Promise<{ notifications: NotificationItem[]; unreadCount: number }> {
  try {
    const supabase = getSupabaseAdmin();

    // 1. Fetch unread count
    const { count: unreadCount } = await supabase
      .from("notifications" as any)
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    // 2. Fetch notifications
    const { data: notifs, error } = await supabase
      .from("notifications" as any)
      .select("id, user_id, type, title, content, link, is_read, actor_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.warn("[Notifications] Fetch error:", error.message);
      return { notifications: [], unreadCount: 0 };
    }

    const items = (notifs || []) as NotificationItem[];

    // Enrich actor profiles if any
    const actorIds = [...new Set(items.map((n) => n.actor_id).filter(Boolean))];
    if (actorIds.length > 0) {
      const { data: actors } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", actorIds as string[]);

      const actorMap = new Map((actors || []).map((a: any) => [a.id, a]));
      for (const item of items) {
        if (item.actor_id && actorMap.has(item.actor_id)) {
          item.actor = actorMap.get(item.actor_id);
        }
      }
    }

    return {
      notifications: items,
      unreadCount: unreadCount ?? 0,
    };
  } catch (err) {
    console.warn("[Notifications] Get notifications error:", err);
    return { notifications: [], unreadCount: 0 };
  }
}
