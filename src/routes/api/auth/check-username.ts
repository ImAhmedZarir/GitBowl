import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isReservedUsername } from "@/lib/reserved-usernames";

export const Route = createFileRoute("/api/auth/check-username")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const raw = url.searchParams.get("username") || "";
          const excludeUserId = url.searchParams.get("excludeUserId") || "";
          const username = raw.trim().toLowerCase();

          if (!username) {
            return new Response(
              JSON.stringify({ available: false, reason: "Username is required" }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }

          if (username.length < 3) {
            return new Response(
              JSON.stringify({
                available: false,
                reason: "Username must be at least 3 characters",
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }

          if (username.length > 39) {
            return new Response(
              JSON.stringify({
                available: false,
                reason: "Username must be at most 39 characters",
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }

          if (!/^[a-z0-9]([a-z0-9-]{1,37}[a-z0-9])?$/.test(username)) {
            return new Response(
              JSON.stringify({
                available: false,
                reason:
                  "Username may only contain lowercase letters, numbers, and hyphens (cannot start or end with a hyphen)",
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }

          if (username.includes("--")) {
            return new Response(
              JSON.stringify({
                available: false,
                reason: "Username cannot contain consecutive hyphens",
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }

          if (isReservedUsername(username)) {
            return new Response(
              JSON.stringify({
                available: false,
                reason: `'${username}' is a reserved handle on GitBowl`,
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }

          // Query database profiles
          let query = supabaseAdmin
            .from("profiles")
            .select("id, username")
            .ilike("username", username);

          if (excludeUserId) {
            query = query.neq("id", excludeUserId);
          }

          const { data, error } = await query;

          if (error) {
            return new Response(JSON.stringify({ available: true }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (data && data.length > 0) {
            return new Response(
              JSON.stringify({
                available: false,
                reason: "This username is already taken",
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }

          return new Response(JSON.stringify({ available: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch {
          return new Response(
            JSON.stringify({ available: false, reason: "Server error checking username" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
