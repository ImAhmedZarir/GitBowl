// src/lib/webhooks.server.ts
import { createHmac } from "node:crypto";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";

export interface WebhookDeliveryParams {
  webhookId: string;
  url: string;
  secret?: string | null;
  event: string;
  payload: Record<string, unknown>;
}

export interface WebhookDeliveryResult {
  success: boolean;
  statusCode: number | null;
  durationMs: number;
  error?: string | null;
}

/**
 * Computes the HMAC-SHA256 signature for a webhook payload.
 */
export function computeWebhookSignature(payloadString: string, secret: string): string {
  const hmac = createHmac("sha256", secret).update(payloadString).digest("hex");
  return `sha256=${hmac}`;
}

/**
 * Delivers a single webhook payload to the destination URL with HMAC signing.
 */
export async function deliverWebhook(
  params: WebhookDeliveryParams,
): Promise<WebhookDeliveryResult> {
  const { webhookId, url, secret, event, payload } = params;
  const payloadString = JSON.stringify(payload);
  const startTime = Date.now();
  const supabase = getSupabaseAdmin();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "GitBowl-Hookshot/1.0",
    "X-GitBowl-Event": event,
    "X-GitBowl-Delivery": webhookId,
  };

  if (secret) {
    headers["X-GitBowl-Signature-256"] = computeWebhookSignature(payloadString, secret);
  }

  let statusCode: number | null = null;
  let responseBody: string | null = null;
  let deliveryError: string | null = null;
  let success = false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: payloadString,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    statusCode = res.status;
    success = res.ok;
    responseBody = (await res.text().catch(() => "")).slice(0, 1000); // truncate to 1kb
  } catch (err: any) {
    deliveryError = err.name === "AbortError" ? "Delivery timed out (10s)" : err.message;
  }

  const durationMs = Date.now() - startTime;

  // Record delivery history in database
  try {
    await supabase.from("webhook_deliveries" as any).insert({
      webhook_id: webhookId,
      event,
      payload: payload as any,
      status_code: statusCode,
      response_body: responseBody,
      duration_ms: durationMs,
      error: deliveryError,
    });
  } catch (dbErr) {
    console.error("[Webhooks] Failed to record delivery log:", dbErr);
  }

  return {
    success,
    statusCode,
    durationMs,
    error: deliveryError,
  };
}

/**
 * Dispatches an event to all active webhooks configured for a repository.
 */
export async function dispatchRepoWebhooks(params: {
  repoId: string;
  event: string;
  payload: Record<string, unknown>;
}) {
  const { repoId, event, payload } = params;
  const supabase = getSupabaseAdmin();

  try {
    const { data: webhooks, error } = await supabase
      .from("webhooks" as any)
      .select("id, url, secret, events, is_active")
      .eq("repo_id", repoId)
      .eq("is_active", true);

    if (error || !webhooks) return;

    for (const hook of webhooks as any[]) {
      const subscribedEvents = hook.events || [];
      if (subscribedEvents.includes(event) || subscribedEvents.includes("*")) {
        // Asynchronously deliver webhook without blocking the main thread
        deliverWebhook({
          webhookId: hook.id,
          url: hook.url,
          secret: hook.secret,
          event,
          payload,
        }).catch((err) => {
          console.error(`[Webhooks] Delivery failed for ${hook.id}:`, err);
        });
      }
    }
  } catch (err) {
    console.error("[Webhooks] Failed to dispatch repository webhooks:", err);
  }
}
