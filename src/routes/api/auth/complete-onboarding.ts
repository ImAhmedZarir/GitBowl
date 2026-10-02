import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/auth/complete-onboarding")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const userId = body.userId;
          const rawUsername = (body.username || "").trim().toLowerCase();
          const displayName = (body.displayName || rawUsername).trim();

          if (!userId) {
            return new Response(JSON.stringify({ error: "User ID is required" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (!/^[a-z0-9]([a-z0-9-]{1,37}[a-z0-9])?$/.test(rawUsername)) {
            return new Response(
              JSON.stringify({
                error:
                  "Username must be 3-39 alphanumeric characters or hyphens (cannot start or end with a hyphen)",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          // Check availability
          const { data: existing } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .ilike("username", rawUsername)
            .neq("id", userId);

          if (existing && existing.length > 0) {
            return new Response(
              JSON.stringify({ error: "Username is already taken by another account" }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          // Update profiles table
          const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
            {
              id: userId,
              username: rawUsername,
              display_name: displayName,
            },
            { onConflict: "id" },
          );

          if (profileError) {
            return new Response(
              JSON.stringify({ error: profileError.message || "Failed to update profile" }),
              { status: 500, headers: { "Content-Type": "application/json" } },
            );
          }

          // Update user metadata in Supabase Auth
          await supabaseAdmin.auth.admin.updateUserById(userId, {
            user_metadata: {
              username: rawUsername,
              name: displayName,
              full_name: displayName,
            },
          });

          return new Response(
            JSON.stringify({
              success: true,
              username: rawUsername,
              displayName,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: err.message || "Failed to complete onboarding" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
