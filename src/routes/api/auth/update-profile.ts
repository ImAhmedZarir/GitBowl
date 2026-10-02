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

export const Route = createFileRoute("/api/auth/update-profile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await getAuthenticatedUser(request);
        if (!user) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const body = await request.json();
          const displayName = (body.displayName || "").trim();
          const bio = body.bio !== undefined ? String(body.bio).slice(0, 250) : null;
          const newUsername = (body.username || "").trim().toLowerCase();

          if (newUsername) {
            if (!/^[a-z0-9]([a-z0-9-]{1,37}[a-z0-9])?$/.test(newUsername)) {
              return new Response(
                JSON.stringify({
                  error:
                    "Username must be 3-39 alphanumeric characters or hyphens (cannot start or end with a hyphen)",
                }),
                { status: 400, headers: { "Content-Type": "application/json" } },
              );
            }

            // Check availability if changing
            const { data: existing } = await supabaseAdmin
              .from("profiles")
              .select("id")
              .ilike("username", newUsername)
              .neq("id", user.id);

            if (existing && existing.length > 0) {
              return new Response(JSON.stringify({ error: "That username is already taken" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
              });
            }
          }

          const updatePayload: {
            display_name?: string;
            bio?: string | null;
            username?: string;
          } = {};

          if (displayName) updatePayload.display_name = displayName;
          if (bio !== undefined) updatePayload.bio = bio;
          if (newUsername) updatePayload.username = newUsername;

          const { data: updated, error: updateError } = await supabaseAdmin
            .from("profiles")
            .update(updatePayload)
            .eq("id", user.id)
            .select("id, username, display_name, bio, created_at")
            .single();

          if (updateError) {
            return new Response(
              JSON.stringify({ error: updateError.message || "Failed to update profile" }),
              { status: 500, headers: { "Content-Type": "application/json" } },
            );
          }

          // Update user metadata in Supabase Auth
          if (newUsername || displayName) {
            await supabaseAdmin.auth.admin.updateUserById(user.id, {
              user_metadata: {
                ...(newUsername ? { username: newUsername } : {}),
                ...(displayName ? { name: displayName, full_name: displayName } : {}),
              },
            });
          }

          return new Response(
            JSON.stringify({
              success: true,
              profile: updated,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: err.message || "Failed to update profile" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
