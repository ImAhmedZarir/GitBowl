import { createFileRoute } from "@tanstack/react-router";
import crypto from "crypto";
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

export const Route = createFileRoute("/api/auth/tokens")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await getAuthenticatedUser(request);
        if (!user) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const { data, error } = await supabaseAdmin
            .from("personal_access_tokens")
            .select("id, name, token_prefix, scopes, expires_at, last_used_at, created_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

          if (error) {
            // If table doesn't exist yet, return empty list gracefully
            return new Response(JSON.stringify({ tokens: [] }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          return new Response(JSON.stringify({ tokens: data ?? [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch {
          return new Response(JSON.stringify({ tokens: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      },

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
          const name = (body.name || "Default Token").trim();
          const expiresInDays = body.expires_in_days ? Number(body.expires_in_days) : 30;

          // Generate secure personal access token
          const rawBytes = crypto.randomBytes(24).toString("hex");
          const token = `gbp_${rawBytes}`;
          const token_prefix = token.slice(0, 10);
          const token_hash = crypto.createHash("sha256").update(token).digest("hex");

          const expires_at =
            expiresInDays > 0
              ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
              : null;

          const { data, error } = await supabaseAdmin
            .from("personal_access_tokens")
            .insert({
              user_id: user.id,
              name,
              token_prefix,
              token_hash,
              scopes: body.scopes || ["repo"],
              expires_at,
            })
            .select("id, name, token_prefix, scopes, expires_at, created_at")
            .single();

          if (error) {
            return new Response(
              JSON.stringify({ error: error.message || "Failed to save token" }),
              { status: 500, headers: { "Content-Type": "application/json" } },
            );
          }

          // Return the full token ONCE to the user
          return new Response(
            JSON.stringify({
              token, // Full token returned only once!
              token_info: data,
            }),
            { status: 201, headers: { "Content-Type": "application/json" } },
          );
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message || "Error generating token" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },

      DELETE: async ({ request }) => {
        const user = await getAuthenticatedUser(request);
        if (!user) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        if (!id) {
          return new Response(JSON.stringify({ error: "Token ID required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        await supabaseAdmin
          .from("personal_access_tokens")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id);

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
