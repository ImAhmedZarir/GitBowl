// src/lib/http.server.ts
// Standardized HTTP helpers, response generators, and security headers.
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import type { User } from "@supabase/supabase-js";

export function getSecurityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-XSS-Protection": "1; mode=block",
  };
}

/**
 * Returns a JSON Response with standard security headers.
 */
export function json<T = unknown>(data: T, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const security = getSecurityHeaders();
  for (const [key, val] of Object.entries(security)) {
    if (!headers.has(key)) {
      headers.set(key, val);
    }
  }

  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
}

/**
 * Returns a standardized JSON error Response.
 */
export function error(
  message: string,
  status = 400,
  extraHeaders?: Record<string, string>,
): Response {
  const headers = new Headers({
    ...getSecurityHeaders(),
    ...extraHeaders,
    "Content-Type": "application/json",
  });

  return new Response(
    JSON.stringify({
      error: message,
      status,
    }),
    {
      status,
      headers,
    },
  );
}

/**
 * Extracts a Bearer token from the Authorization header or cookie.
 */
export function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }

  // Check cookie fallback if present (e.g. sb-access-token)
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)(?:sb-[a-zA-Z0-9_-]+-auth-token|sb-access-token)=([^;]+)/);
    if (match && match[1]) {
      try {
        const decoded = decodeURIComponent(match[1]);
        if (decoded.startsWith("[")) {
          const parsed = JSON.parse(decoded);
          if (Array.isArray(parsed) && typeof parsed[0] === "string") {
            return parsed[0];
          }
        }
        return decoded;
      } catch {
        return match[1];
      }
    }
  }

  return null;
}

/**
 * Authenticates the user via Supabase and returns the verified User object.
 * Throws a 401 Response if unauthenticated or invalid.
 */
export async function getAuthenticatedUser(request: Request): Promise<User> {
  const token = getBearerToken(request);
  if (!token) {
    throw error("Authentication required: Missing or invalid token", 401);
  }

  const supabase = getSupabaseAdmin();
  const { data, error: authError } = await supabase.auth.getUser(token);

  if (authError || !data?.user) {
    throw error("Authentication failed: Invalid or expired session", 401);
  }

  return data.user;
}
