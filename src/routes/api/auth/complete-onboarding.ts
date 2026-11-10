// src/routes/api/auth/complete-onboarding.ts
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getActor } from "@/lib/authz.server";

const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "root",
  "system",
  "support",
  "help",
  "status",
  "api",
  "auth",
  "raw",
  "pages",
  "settings",
  "explore",
  "pulls",
  "issues",
  "notifications",
  "search",
  "new",
  "docs",
  "tos",
  "privacy",
  "internal",
  "gitbowl",
  "developer",
  "public",
  "static",
  "assets",
]);

export function isValidUsername(username: string): { valid: boolean; error?: string } {
  const clean = (username || "").trim().toLowerCase();
  if (clean.length < 3 || clean.length > 39) {
    return { valid: false, error: "Username must be between 3 and 39 characters" };
  }
  if (!/^[a-z0-9]([a-z0-9-]{1,37}[a-z0-9])?$/.test(clean)) {
    return {
      valid: false,
      error: "Username must contain only lowercase alphanumeric characters or hyphens and cannot start or end with a hyphen",
    };
  }
  if (RESERVED_USERNAMES.has(clean)) {
    return { valid: false, error: `The username '${clean}' is reserved by the system` };
  }
  return { valid: true };
}

export const Route = createFileRoute("/api/auth/complete-onboarding")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const actor = await getActor(request);
          if (!actor) {
            return new Response(JSON.stringify({ error: "Authentication required" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

          const body = await request.json().catch(() => ({}));
          const rawUsername = (body.username || "").trim().toLowerCase();
          const displayName = (body.displayName || rawUsername).trim();

          // Validate username format and reserved names
          const val = isValidUsername(rawUsername);
          if (!val.valid) {
            return new Response(JSON.stringify({ error: val.error }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Check for collision with existing profile
          const { data: existingProfile } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .ilike("username", rawUsername)
            .neq("id", actor.userId);

          if (existingProfile && existingProfile.length > 0) {
            return new Response(
              JSON.stringify({ error: "Username is already taken by another account" }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          // Check for collision with existing organisation slug
          const { data: existingOrg } = await supabaseAdmin
            .from("orgs" as any)
            .select("id")
            .ilike("slug", rawUsername);

          if (existingOrg && existingOrg.length > 0) {
            return new Response(
              JSON.stringify({ error: "Username is already registered as an organization" }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          // Update profiles table strictly for the authenticated actor.userId
          const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
            {
              id: actor.userId,
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
