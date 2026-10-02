import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function getAuthenticatedUser(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export const Route = createFileRoute("/api/user/follow")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const targetUserId = url.searchParams.get("userId");
        const currentUser = await getAuthenticatedUser(request);

        if (!targetUserId) {
          return new Response(JSON.stringify({ error: "userId is required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          // 1. Query followers count from follows table
          const [followersRes, followingRes, isFollowingRes, profileRes] = await Promise.all([
            supabaseAdmin
              .from("follows")
              .select("*", { count: "exact", head: true })
              .eq("followee_id", targetUserId),
            supabaseAdmin
              .from("follows")
              .select("*", { count: "exact", head: true })
              .eq("follower_id", targetUserId),
            currentUser
              ? supabaseAdmin
                  .from("follows")
                  .select("created_at")
                  .eq("follower_id", currentUser.id)
                  .eq("followee_id", targetUserId)
                  .maybeSingle()
              : Promise.resolve({ data: null, error: null }),
            supabaseAdmin
              .from("profiles")
              .select("id, username, display_name, bio")
              .eq("id", targetUserId)
              .maybeSingle(),
          ]);

          // Fetch user metadata from auth.users (for avatar_url, location, etc.)
          let userMeta: Record<string, any> = {};
          try {
            const { data: authUserData } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
            userMeta = authUserData.user?.user_metadata || {};
          } catch {
            // Ignore if auth user lookup fails
          }

          const followersCount = followersRes.count ?? 0;
          const followingCount = followingRes.count ?? 0;
          const isFollowing = Boolean(isFollowingRes.data);

          return new Response(
            JSON.stringify({
              followersCount,
              followingCount,
              isFollowing,
              metadata: {
                avatar_url: (profileRes.data as any)?.avatar_url || userMeta["avatar_url"] || null,
                website: userMeta["website"] || null,
                location: userMeta["location"] || null,
                pronouns: userMeta["pronouns"] || null,
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        } catch (err: any) {
          console.error("[Follow API] Error:", err);
          return new Response(
            JSON.stringify({
              followersCount: 0,
              followingCount: 0,
              isFollowing: false,
              metadata: {},
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      },

      POST: async ({ request }) => {
        const currentUser = await getAuthenticatedUser(request);
        if (!currentUser) {
          return new Response(JSON.stringify({ error: "Authentication required" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const body = await request.json();
          const { targetUserId, action } = body;

          if (!targetUserId) {
            return new Response(JSON.stringify({ error: "targetUserId is required" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (targetUserId === currentUser.id) {
            return new Response(JSON.stringify({ error: "You cannot follow yourself" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (action === "follow") {
            const { error } = await supabaseAdmin.from("follows").insert({
              follower_id: currentUser.id,
              followee_id: targetUserId,
              created_at: new Date().toISOString(),
            });

            if (error && error.code !== "23505") {
              // 23505 is unique violation, which is fine
              throw error;
            }

            return new Response(JSON.stringify({ success: true, isFollowing: true }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } else {
            // Unfollow
            const { error } = await supabaseAdmin
              .from("follows")
              .delete()
              .eq("follower_id", currentUser.id)
              .eq("followee_id", targetUserId);

            if (error) throw error;

            return new Response(JSON.stringify({ success: true, isFollowing: false }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
        } catch (err: any) {
          console.error("[Follow Action] Error:", err);
          return new Response(JSON.stringify({ error: err.message || "Failed to update follow" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
