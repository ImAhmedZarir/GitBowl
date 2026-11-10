import { createFileRoute } from "@tanstack/react-router";
import crypto from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getActor } from "@/lib/authz.server";

const ALLOWED_SCOPES = new Set([
  "repo",
  "repo:read",
  "repo:write",
  "user",
  "user:read",
  "org:read",
]);

export const Route = createFileRoute("/api/auth/tokens")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const actor = await getActor(request);
        if (!actor) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const { data, error } = await supabaseAdmin
            .from("personal_access_tokens")
            .select("id, name, token_prefix, scopes, expires_at, last_used_at, created_at")
            .eq("user_id", actor.userId)
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
        const actor = await getActor(request);
        if (!actor) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const body = await request.json();
          const name = String(body.name || "Default Token").trim().slice(0, 100);
          if (!name) {
            return new Response(JSON.stringify({ error: "Token name cannot be empty" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Check token limit per user (max 50)
          const { count, error: countErr } = await supabaseAdmin
            .from("personal_access_tokens")
            .select("id", { count: "exact", head: true })
            .eq("user_id", actor.userId);

          if (!countErr && (count ?? 0) >= 50) {
            return new Response(
              JSON.stringify({ error: "Token limit reached. Maximum 50 personal access tokens allowed per account." }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          // Validate scopes against allowlist
          let requestedScopes = Array.isArray(body.scopes) ? body.scopes : ["repo"];
          const validScopes = requestedScopes.filter((s: any) => typeof s === "string" && ALLOWED_SCOPES.has(s));
          if (validScopes.length === 0) {
            validScopes.push("repo:read");
          }

          // Expiry handling: clamp between 1 and 365 days, or null
          const rawDays = body.expires_in_days !== undefined ? Number(body.expires_in_days) : 30;
          const expiresInDays = isNaN(rawDays) ? 30 : Math.max(0, Math.min(365, rawDays));

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
              user_id: actor.userId,
              name,
              token_prefix,
              token_hash,
              scopes: validScopes,
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
        const actor = await getActor(request);
        if (!actor) {
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
          .eq("user_id", actor.userId);

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
