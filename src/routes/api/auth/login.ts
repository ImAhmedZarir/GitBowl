import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// In-memory sliding window rate limiter by IP
const attempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + 5 * 60 * 1000 });
    return false;
  }
  entry.count++;
  return entry.count > 12; // Max 12 failed attempts per 5 minutes
}

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const clientIp =
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";

        if (isRateLimited(clientIp)) {
          return new Response(
            JSON.stringify({ error: "Too many login attempts. Please wait 5 minutes." }),
            { status: 429, headers: { "Content-Type": "application/json" } },
          );
        }

        try {
          const body = await request.json();
          const identifier = (body.identifier || "").trim();
          const password = body.password || "";

          if (!identifier || !password) {
            return new Response(
              JSON.stringify({ error: "Username/email and password are required" }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          let email = identifier;

          // If identifier has no @, resolve username -> email securely on the server
          if (!identifier.includes("@")) {
            const { data: profile } = await supabaseAdmin
              .from("profiles")
              .select("id")
              .ilike("username", identifier.toLowerCase())
              .maybeSingle();

            if (!profile) {
              // Return generic error to prevent username enumeration
              return new Response(JSON.stringify({ error: "Invalid credentials" }), {
                status: 401,
                headers: { "Content-Type": "application/json" },
              });
            }

            const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(
              profile.id,
            );

            if (userError || !userData.user?.email) {
              return new Response(JSON.stringify({ error: "Invalid credentials" }), {
                status: 401,
                headers: { "Content-Type": "application/json" },
              });
            }

            email = userData.user.email;
          }

          // Sign in using Supabase Auth
          const { data, error } = await supabaseAdmin.auth.signInWithPassword({
            email,
            password,
          });

          if (error || !data.session) {
            return new Response(JSON.stringify({ error: "Invalid credentials" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

          return new Response(
            JSON.stringify({
              session: data.session,
              user: data.user,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message || "Authentication failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
