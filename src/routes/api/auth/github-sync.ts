import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/auth/github-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const email = (body.email || "").trim().toLowerCase();
          const displayName = (body.displayName || "").trim();
          const photoURL = body.photoURL || null;

          // If GitHub account didn't expose public email, synthesize one from displayName
          const targetEmail =
            email ||
            `${displayName.toLowerCase().replace(/[^a-z0-9-]/g, "") || "user"}@github.gitbowl.local`;

          // 1. Check if user already exists
          let userId: string | null = null;
          const { data: usersData } = await supabaseAdmin.auth.admin.listUsers({
            page: 1,
            perPage: 100,
          });

          const existingUser = usersData?.users?.find(
            (u) => u.email?.toLowerCase() === targetEmail.toLowerCase(),
          );

          if (existingUser) {
            userId = existingUser.id;
          } else {
            const derivedUsername =
              (displayName || targetEmail.split("@")[0])
                ?.toLowerCase()
                .replace(/[^a-z0-9-]/g, "-") || "gh-" + Math.random().toString(36).substring(2, 8);

            const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser(
              {
                email: targetEmail,
                email_confirm: true,
                user_metadata: {
                  full_name: displayName,
                  name: displayName,
                  avatar_url: photoURL,
                  username: derivedUsername,
                  provider: "github",
                },
              },
            );

            if (createError) {
              return new Response(JSON.stringify({ error: createError.message }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
              });
            }

            userId = newUser.user.id;

            // Ensure profile exists
            await supabaseAdmin.from("profiles").upsert(
              {
                id: userId,
                username: derivedUsername,
                display_name: displayName || derivedUsername,
                bio: "GitHub verified developer",
                created_at: new Date().toISOString(),
              },
              { onConflict: "id" },
            );
          }

          // 2. Generate magic link token for client Supabase session
          const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: "magiclink",
            email: targetEmail,
          });

          if (linkError || !linkData?.properties?.hashed_token) {
            return new Response(
              JSON.stringify({ error: linkError?.message || "Failed to generate session link" }),
              { status: 500, headers: { "Content-Type": "application/json" } },
            );
          }

          return new Response(
            JSON.stringify({
              hashed_token: linkData.properties.hashed_token,
              userId,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: err.message || "Failed to sync GitHub user" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
