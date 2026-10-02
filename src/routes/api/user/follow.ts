import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function getAuthenticatedUser(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
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
          const { data: usersData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
          const allUsers = usersData?.users || [];

          // Target user's following list
          const targetUser = allUsers.find((u) => u.id === targetUserId);
          const targetFollowing: string[] = targetUser?.user_metadata?.following || [];

          // Count how many users have targetUserId in their following array
          let followersCount = 0;
          for (const u of allUsers) {
            const fList: string[] = u.user_metadata?.following || [];
            if (fList.includes(targetUserId)) {
              followersCount++;
            }
          }

          // Check if current user is following target user
          let isFollowing = false;
          if (currentUser) {
            const currentFollowing: string[] = currentUser.user_metadata?.following || [];
            isFollowing = currentFollowing.includes(targetUserId);
          }

          return new Response(
            JSON.stringify({
              followersCount,
              followingCount: targetFollowing.length,
              isFollowing,
              metadata: {
                avatar_url: targetUser?.user_metadata?.avatar_url || null,
                website: targetUser?.user_metadata?.website || null,
                location: targetUser?.user_metadata?.location || null,
                pronouns: targetUser?.user_metadata?.pronouns || null,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (e: any) {
          return new Response(
            JSON.stringify({ followersCount: 0, followingCount: 0, isFollowing: false }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
      },

      POST: async ({ request }) => {
        const currentUser = await getAuthenticatedUser(request);
        if (!currentUser) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
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
            return new Response(JSON.stringify({ error: "Cannot follow yourself" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const currentFollowing: string[] = Array.isArray(currentUser.user_metadata?.following)
            ? [...currentUser.user_metadata.following]
            : [];

          let isFollowing = false;

          if (action === "follow") {
            if (!currentFollowing.includes(targetUserId)) {
              currentFollowing.push(targetUserId);
            }
            isFollowing = true;
          } else if (action === "unfollow") {
            const idx = currentFollowing.indexOf(targetUserId);
            if (idx > -1) {
              currentFollowing.splice(idx, 1);
            }
            isFollowing = false;
          } else {
            // Toggle
            const idx = currentFollowing.indexOf(targetUserId);
            if (idx > -1) {
              currentFollowing.splice(idx, 1);
              isFollowing = false;
            } else {
              currentFollowing.push(targetUserId);
              isFollowing = true;
            }
          }

          // Persist in auth user metadata
          await supabaseAdmin.auth.admin.updateUserById(currentUser.id, {
            user_metadata: {
              ...(currentUser.user_metadata || {}),
              following: currentFollowing,
            },
          });

          // Compute new followersCount for target user
          const { data: usersData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
          const allUsers = usersData?.users || [];
          let followersCount = 0;
          for (const u of allUsers) {
            const fList: string[] =
              u.id === currentUser.id ? currentFollowing : u.user_metadata?.following || [];
            if (fList.includes(targetUserId)) {
              followersCount++;
            }
          }

          return new Response(
            JSON.stringify({
              success: true,
              isFollowing,
              followersCount,
              followingCount: currentFollowing.length,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (err: any) {
          console.error("Follow error:", err);
          return new Response(JSON.stringify({ error: err.message || "Failed to update follow" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
