// src/routes/api/auth/google-sync.ts
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyFirebaseIdToken } from "@/lib/firebase-verify.server";

export const Route = createFileRoute("/api/auth/google-sync")({
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

          if (!claims || !claims.email) {
            return new Response(
              JSON.stringify({ error: "Invalid or expired Firebase ID token" }),
              { status: 401, headers: { "Content-Type": "application/json" } },
            );
          }

          const email = claims.email.trim().toLowerCase();
          const displayName = (claims.name || "").trim();
          const photoURL = claims.picture || null;

          // Direct user lookup via SQL or getUserByEmail
          let userId: string | null = null;
          const { data: userByEmail } = await supabaseAdmin
            .from("profiles")
            .select("id, username, display_name")
            .eq("id", (
              await supabaseAdmin.rpc("get_user_id_by_email" as any, { user_email: email }).catch(() => ({})) as any
            )?.data || "none")
            .maybeSingle();

          // Query auth.users directly via admin client if rpc not available
          if (!userByEmail) {
            // Find existing user in profiles by username or check admin getUserByEmail
            const { data: userData } = await (supabaseAdmin.auth.admin as any).getUserByEmail?.(email).catch(() => ({ data: null })) || { data: null };
            if (userData?.user) {
              userId = userData.user.id;
            }
          } else {
            userId = userByEmail.id;
          }

          // If user still not found, check with bounded single query
          if (!userId) {
            const { data: listRes } = await supabaseAdmin.auth.admin.listUsers({
              page: 1,
              perPage: 1,
            });
            // Try creating user directly; if email exists, Supabase createUser will return existing/duplicate error
            const derivedUsername =
              email
                .split("@")[0]
                ?.toLowerCase()
                .replace(/[^a-z0-9-]/g, "-")
                .slice(0, 30) || "user-" + Math.random().toString(36).substring(2, 8);

            const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser(
              {
                email,
                email_confirm: true,
                user_metadata: {
                  full_name: displayName,
                  name: displayName,
                  avatar_url: photoURL,
                  username: derivedUsername,
                },
              },
            );

            if (createError) {
              // If user already registered, generateLink directly
              if (createError.message?.toLowerCase().includes("already registered") || (createError as any).status === 422) {
                // Link will be generated below
              } else {
                return new Response(JSON.stringify({ error: createError.message }), {
                  status: 500,
                  headers: { "Content-Type": "application/json" },
                });
              }
            } else if (newUser?.user) {
              userId = newUser.user.id;
              // Ensure profile exists
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
            }
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

          return new Response(
            JSON.stringify({
              hashed_token: linkData.properties.hashed_token,
              email,
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
