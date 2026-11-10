// src/routes/api/auth/complete-onboarding.ts
// Hardened onboarding finalization requiring server-side session authentication.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { validateUsername, normalizeUsername } from "@/lib/username";
import { getAuthenticatedUser, json, error } from "@/lib/http.server";

export const Route = createFileRoute("/api/auth/complete-onboarding")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // 1. Authenticate user strictly from Bearer token or cookie session (never trust body userId)
          let authenticatedUser;
          try {
            authenticatedUser = await getAuthenticatedUser(request);
          } catch (authErr) {
            return authErr instanceof Response
              ? authErr
              : error("Authentication required: Please sign in to complete onboarding", 401);
          }

          const userId = authenticatedUser.id;
          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
          const rawUsername = typeof body["username"] === "string" ? body["username"] : "";
          const rawDisplayName = typeof body["displayName"] === "string" ? body["displayName"] : "";

          // 2. Check if user has already completed onboarding
          const { data: currentProfile } = await supabaseAdmin
            .from("profiles")
            .select("id, username, onboarding_completed")
            .eq("id", userId)
            .maybeSingle();

          if (currentProfile && (currentProfile as { onboarding_completed?: boolean }).onboarding_completed === true) {
            return error("Onboarding has already been completed for this account", 400);
          }

          // 3. Strict username validation
          const validation = validateUsername(rawUsername);
          if (!validation.valid) {
            return error(validation.error || "Invalid username format", 400);
          }

          const cleanUsername = normalizeUsername(rawUsername);
          const cleanDisplayName = (rawDisplayName.trim() || cleanUsername).slice(0, 70);

          // 4. Check for username collision in profiles (exact case-insensitive match)
          const { data: existingUser } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("username", cleanUsername)
            .neq("id", userId)
            .maybeSingle();

          if (existingUser) {
            return error("Username is already taken by another account", 400);
          }

          // 5. Check for handle collision with organizations
          const { data: existingOrg } = await (supabaseAdmin.from("orgs" as any) as any)
            .select("id")
            .eq("slug", cleanUsername)
            .maybeSingle();

          if (existingOrg) {
            return error("This handle is already taken by an organization", 400);
          }

          // 6. Persist profile update and record onboarding as completed
          const { error: profileError } = await (supabaseAdmin.from("profiles" as any) as any).upsert(
            {
              id: userId,
              username: cleanUsername,
              display_name: cleanDisplayName,
              onboarding_completed: true,
            },
            { onConflict: "id" },
          );

          if (profileError) {
            return error(profileError.message || "Failed to update profile", 500);
          }

          // 7. Update auth metadata in Supabase Auth
          await supabaseAdmin.auth.admin.updateUserById(userId, {
            user_metadata: {
              username: cleanUsername,
              name: cleanDisplayName,
              full_name: cleanDisplayName,
              onboarding_completed: true,
            },
          });

          return json({
            success: true,
            username: cleanUsername,
            displayName: cleanDisplayName,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Failed to complete onboarding";
          return error(msg, 500);
        }
      },
    },
  },
});
