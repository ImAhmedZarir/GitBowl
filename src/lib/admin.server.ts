// src/lib/admin.server.ts
// Server-side Admin Authentication & Audit Logging for GitBowl
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  role: string;
}

/**
 * Returns true if the email is in the admin whitelist configured via ADMIN_EMAILS.
 * If ADMIN_EMAILS is empty or unset, nobody is considered an admin.
 */
export function isWhitelistedAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const configuredEnv = process.env["ADMIN_EMAILS"] || "";
  if (!configuredEnv.trim()) {
    return false;
  }

  const normalized = email.trim().toLowerCase();
  const configured = configuredEnv
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return configured.includes(normalized);
}

/**
 * Validates request for admin privileges.
 * Returns AdminUser if verified, or throws a 404 response if unauthorized.
 * Note: Non-admins receive a genuine 404 to avoid leaking admin surface area.
 */
export async function requireAdmin(request: Request): Promise<AdminUser> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    throw new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const token = authHeader.slice(7).trim();
  const supabase = getSupabaseAdmin();

  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !userData?.user) {
    throw new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const user = userData.user;
  // Admin identity is strictly decided by verified primary email ONLY (never user_metadata).
  const email = (user.email || "").trim().toLowerCase();
  const isConfirmed = Boolean(user.email_confirmed_at || user.confirmed_at);

  if (!email || !isConfirmed || !isWhitelistedAdminEmail(email)) {
    throw new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Fetch profile for display username only (never trusted for permissions)
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, role")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email!,
    username: profile?.username || email.split("@")[0] || "admin",
    role: "admin",
  };
}

/**
 * Records an immutable audit trail entry.
 */
export async function recordAuditLog(params: {
  actorId?: string | null | undefined;
  action: string;
  targetType: string;
  targetId?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
  ip?: string | null | undefined;
}): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    // Using string indexing to allow dynamic table definition
    await (supabase.from as (table: string) => {
      insert: (record: Record<string, unknown>) => Promise<{ error: unknown }>;
    })("audit_log").insert({
      actor_id: params.actorId || null,
      action: params.action,
      target_type: params.targetType,
      target_id: params.targetId || null,
      metadata: params.metadata || {},
      ip: params.ip || null,
    });
  } catch (err) {
    console.error("[AuditLog] Failed to record audit log:", err);
  }
}
