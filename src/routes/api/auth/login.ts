import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin, createSupabaseFetch } from "@/integrations/supabase/client.server";

// In-memory sliding window rate limiter by key (IP and Account)
const attempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(key: string, maxAttempts = 10, windowMs = 5 * 60 * 1000): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count++;
  return entry.count > maxAttempts;
}

function getAnonAuthClient() {
  const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
  const anonKey =
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["VITE_SUPABASE_ANON_KEY"] ||
    process.env["SUPABASE_ANON_KEY"];
  if (!url || !anonKey) {
    throw new Error("[Security Fatal] Missing Supabase anon client configuration.");
  }
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: createSupabaseFetch(anonKey),
    },
  });
}

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const clientIp =
          request.headers.get("cf-connecting-ip") ||
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "127.0.0.1";

        if (isRateLimited(`ip:${clientIp}`, 12, 5 * 60 * 1000)) {
          return new Response(
            JSON.stringify({ error: "Too many login attempts from this IP. Please wait 5 minutes." }),
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

          const accountKey = `acc:${identifier.toLowerCase()}`;
          if (isRateLimited(accountKey, 10, 5 * 60 * 1000)) {
            return new Response(
              JSON.stringify({ error: "Too many failed attempts for this account. Please wait 5 minutes." }),
              { status: 429, headers: { "Content-Type": "application/json" } },
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
              // Timing attack mitigation: introduce artificial delay to match bcrypt/scrypt timing
              await new Promise((r) => setTimeout(r, 220));
              return new Response(JSON.stringify({ error: "Invalid credentials" }), {
                status: 401,
                headers: { "Content-Type": "application/json" },
              });
            }

            const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(
              profile.id,
            );

            if (userError || !userData.user?.email) {
              await new Promise((r) => setTimeout(r, 180));
              return new Response(JSON.stringify({ error: "Invalid credentials" }), {
                status: 401,
                headers: { "Content-Type": "application/json" },
              });
            }

            email = userData.user.email;
          }

          // Sign in using isolated anon client with persistSession: false
          const anonClient = getAnonAuthClient();
          const { data, error } = await anonClient.auth.signInWithPassword({
            email,
            password,
          });

          if (error || !data.session) {
            return new Response(JSON.stringify({ error: "Invalid credentials" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Reset failure counts on successful login
          attempts.delete(accountKey);

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
