// src/lib/audit.server.ts
// Central enterprise audit logging utility
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";

export interface AuditEventParams {
  orgId?: string | null;
  actorId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  req?: Request;
}

export async function logAuditEvent(params: AuditEventParams): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    let ip = "127.0.0.1";
    let userAgent = "GitBowl Server";

    if (params.req) {
      ip =
        params.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        params.req.headers.get("x-real-ip") ||
        "127.0.0.1";
      userAgent = params.req.headers.get("user-agent") || "GitBowl Server";
    }

    const { error } = await supabase.from("audit_logs" as any).insert({
      org_id: params.orgId || null,
      actor_id: params.actorId || null,
      ip_address: ip,
      user_agent: userAgent,
      action: params.action,
      target_type: params.targetType || null,
      target_id: params.targetId || null,
      metadata: params.metadata || {},
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.warn("[AuditLog] Failed to record audit event:", error.message);
    }
  } catch (err) {
    console.warn("[AuditLog] Unexpected error logging audit event:", err);
  }
}
