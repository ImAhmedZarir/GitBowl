import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isReservedUsername } from "@/lib/reserved-usernames";
import { getActor } from "@/lib/authz.server";

function isValidUrl(val: string): boolean {
  try {
    const u = new URL(val);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/auth/update-profile")({
  server: {
    handlers: {
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
          const displayName = (body.displayName || "").trim().slice(0, 100);
          const bio = body.bio !== undefined ? String(body.bio).trim().slice(0, 250) : undefined;
          const newUsername = (body.username || "").trim().toLowerCase();
          const rawAvatarUrl =
            body.avatarUrl !== undefined ? String(body.avatarUrl).trim().slice(0, 500) : undefined;
          const rawWebsite =
            body.website !== undefined ? String(body.website).trim().slice(0, 200) : undefined;
          const location =
            body.location !== undefined ? String(body.location).trim().slice(0, 100) : undefined;
          const pronouns =
            body.pronouns !== undefined ? String(body.pronouns).trim().slice(0, 50) : undefined;

          // URL safety validation
          if (rawAvatarUrl && !isValidUrl(rawAvatarUrl)) {
            return new Response(
              JSON.stringify({ error: "Avatar URL must be a valid http/https URL" }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }
          if (rawWebsite && !isValidUrl(rawWebsite)) {
            return new Response(
              JSON.stringify({ error: "Website must be a valid http/https URL" }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

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

            if (isReservedUsername(newUsername)) {
              return new Response(
                JSON.stringify({ error: `'${newUsername}' is a reserved system handle` }),
                { status: 400, headers: { "Content-Type": "application/json" } },
              );
            }

            // Check availability if changing - check both profiles and orgs
            const { data: existingProfiles } = await supabaseAdmin
              .from("profiles")
              .select("id")
              .ilike("username", newUsername)
              .neq("id", actor.userId);

            if (existingProfiles && existingProfiles.length > 0) {
              return new Response(JSON.stringify({ error: "That username is already taken" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
              });
            }

            const { data: existingOrgs } = await supabaseAdmin
              .from("orgs")
              .select("id")
              .ilike("slug", newUsername);

            if (existingOrgs && existingOrgs.length > 0) {
              return new Response(
                JSON.stringify({ error: "That handle is already taken by an organization" }),
                { status: 400, headers: { "Content-Type": "application/json" } },
              );
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
            .eq("id", actor.userId)
            .select("id, username, display_name, bio, created_at")
            .single();

          if (updateError) {
            return new Response(
              JSON.stringify({ error: updateError.message || "Failed to update profile" }),
              { status: 500, headers: { "Content-Type": "application/json" } },
            );
          }

          // Fetch user metadata from Supabase Auth to update
          const { data: userData } = await supabaseAdmin.auth.admin.getUserById(actor.userId);
          const newMetadata: Record<string, any> = {
            ...(userData?.user?.user_metadata || {}),
          };

          if (newUsername) newMetadata["username"] = newUsername;
          if (displayName) {
            newMetadata["name"] = displayName;
            newMetadata["full_name"] = displayName;
          }
          if (rawAvatarUrl !== undefined) newMetadata["avatar_url"] = rawAvatarUrl;
          if (rawWebsite !== undefined) newMetadata["website"] = rawWebsite;
          if (location !== undefined) newMetadata["location"] = location;
          if (pronouns !== undefined) newMetadata["pronouns"] = pronouns;

          await supabaseAdmin.auth.admin.updateUserById(actor.userId, {
            user_metadata: newMetadata,
          });

          return new Response(
            JSON.stringify({
              success: true,
              profile: {
                ...updated,
                avatar_url: newMetadata["avatar_url"] || null,
                website: newMetadata["website"] || null,
                location: newMetadata["location"] || null,
                pronouns: newMetadata["pronouns"] || null,
              },
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
