// src/routes/api/auth/github-sync.ts
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyFirebaseIdToken } from "@/lib/firebase-verify.server";

export const Route = createFileRoute("/api/auth/github-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization");
          if (!authHeader?.toLowerCase().startsWith("bearer ")) {
            return new Response(
              JSON.stringify({ error: "Missing Firebase authentication token" }),
              { status: 401, headers: { "Content-Type": "application/json" } },
            );
          }

          const idToken = authHeader.slice(7).trim();
          const claims = await verifyFirebaseIdToken(idToken);

          if (!claims || !claims.uid) {
            return new Response(
              JSON.stringify({ error: "Invalid or expired Firebase ID token" }),
              { status: 401, headers: { "Content-Type": "application/json" } },
            );
          }

          const displayName = (claims.name || "").trim();
          const photoURL = claims.picture || null;

          // If GitHub account didn't expose verified email, use provider-scoped email
          const targetEmail =
            claims.email && claims.email_verified
              ? claims.email.trim().toLowerCase()
              : `gh-${claims.uid}@github.gitbowl.internal`;

          // Bounded user creation in Supabase Auth
          const derivedUsername =
            (displayName || claims.uid)
              ?.toLowerCase()
              .replace(/[^a-z0-9-]/g, "-")
              .slice(0, 30) || "gh-" + claims.uid.slice(0, 8);

          const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: targetEmail,
            email_confirm: true,
            user_metadata: {
              full_name: displayName,
              name: displayName,
              avatar_url: photoURL,
              username: derivedUsername,
              provider: "github",
              firebase_uid: claims.uid,
            },
          });

          if (
            createError &&
            !createError.message?.toLowerCase().includes("already registered") &&
            (createError as any).status !== 422
          ) {
            return new Response(JSON.stringify({ error: createError.message }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (newUser?.user) {
            await supabaseAdmin.from("profiles").upsert(
              {
                id: newUser.user.id,
                username: derivedUsername,
                display_name: displayName || derivedUsername,
                bio: null,
                created_at: new Date().toISOString(),
              },
              { onConflict: "id" },
            );
          }

          // Generate magiclink token
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
              email: targetEmail,
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
            JSON.stringify({ error: err.message || "Failed to synchronize GitHub authentication" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
