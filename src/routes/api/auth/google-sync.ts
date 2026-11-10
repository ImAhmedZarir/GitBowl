// src/routes/api/auth/google-sync.ts
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyFirebaseIdToken } from "@/lib/firebase-verify.server";

export const Route = createFileRoute("/api/auth/google-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({}));
          const authHeader = request.headers.get("authorization");
          let idToken = "";

          if (authHeader?.toLowerCase().startsWith("bearer ")) {
            idToken = authHeader.slice(7).trim();
          } else if (body.idToken && typeof body.idToken === "string") {
            idToken = body.idToken.trim();
          }

          if (!idToken) {
            return new Response(
              JSON.stringify({ error: "Missing Firebase authentication token" }),
              { status: 401, headers: { "Content-Type": "application/json" } },
            );
          }

          const claims = await verifyFirebaseIdToken(idToken);

          if (!claims || !claims.email) {
            return new Response(
              JSON.stringify({ error: "Invalid or expired Firebase ID token" }),
              { status: 401, headers: { "Content-Type": "application/json" } },
            );
          }

          const email = claims.email.trim().toLowerCase();
          const displayName = (claims.name || body.displayName || "").trim();
          const photoURL = claims.picture || body.photoURL || null;

          let isNewUser = false;
          let userId: string | null = null;
          let existingProfile: { username: string; display_name: string | null } | null = null;

          // Check if profile exists by email resolution or auth query
          const derivedUsername =
            email
              .split("@")[0]
              ?.toLowerCase()
              .replace(/[^a-z0-9-]/g, "-")
              .slice(0, 30) || "user-" + Math.random().toString(36).substring(2, 8);

          // 1. Try to create user directly in Supabase auth
          const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            email_confirm: true,
            user_metadata: {
              full_name: displayName,
              name: displayName,
              avatar_url: photoURL,
              username: derivedUsername,
            },
          });

          if (newUser?.user) {
            userId = newUser.user.id;
            isNewUser = true;

            await supabaseAdmin.from("profiles").upsert(
              {
                id: userId,
                username: derivedUsername,
                display_name: displayName || derivedUsername,
                bio: null,
                created_at: new Date().toISOString(),
              },
              { onConflict: "id" },
            );
          } else if (
            createError?.message?.toLowerCase().includes("already registered") ||
            (createError as any)?.status === 422
          ) {
            // User already registered in Supabase auth; find their profile
            // Check profiles
            const { data: prof } = await supabaseAdmin
              .from("profiles")
              .select("id, username, display_name")
              .ilike("username", derivedUsername)
              .maybeSingle();

            if (prof) {
              userId = prof.id;
              existingProfile = prof;
            }
          } else if (createError) {
            return new Response(JSON.stringify({ error: createError.message }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          // 2. Generate a magiclink token so client can verifyOtp and establish Supabase session
          const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: "magiclink",
            email,
          });

          if (linkError || !linkData?.properties?.hashed_token) {
            return new Response(
              JSON.stringify({ error: linkError?.message || "Failed to generate session link" }),
              { status: 500, headers: { "Content-Type": "application/json" } },
            );
          }

          if (linkData.user?.id) {
            userId = linkData.user.id;
          }

          return new Response(
            JSON.stringify({
              hashed_token: linkData.properties.hashed_token,
              email,
              userId: userId || linkData.user?.id || "",
              isNewUser,
              suggestedUsername: existingProfile?.username || derivedUsername,
              displayName: existingProfile?.display_name || displayName || derivedUsername,
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "private, no-store",
              },
            },
          );
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: err.message || "Failed to synchronize Google authentication" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
