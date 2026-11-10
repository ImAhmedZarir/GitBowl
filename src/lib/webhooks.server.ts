// src/lib/webhooks.server.ts
import { createHmac } from "node:crypto";
import dns from "node:dns/promises";
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

function isPrivateIp(ip: string): boolean {
  const trimmed = ip.trim().toLowerCase();
  if (trimmed === "localhost" || trimmed === "::1" || trimmed === "0.0.0.0") return true;

  if (trimmed.includes(".")) {
    const parts = trimmed.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return true;
    if (parts[0] === 0) return true;
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    if (parts[0] >= 224) return true;
  }

  if (trimmed.includes(":")) {
    if (trimmed.startsWith("fc") || trimmed.startsWith("fd")) return true;
    if (trimmed.startsWith("fe80")) return true;
    if (trimmed.startsWith("::ffff:")) {
      const v4Part = trimmed.replace("::ffff:", "");
      return isPrivateIp(v4Part);
    }
  }

  return false;
}

async function verifyWebhookDestination(targetUrl: string): Promise<void> {
  const parsed = new URL(targetUrl);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Unsupported webhook protocol: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0") {
    throw new Error("Loopback webhook destinations are blocked");
  }

  // Resolve DNS to verify IP is not in private or cloud metadata ranges
  const records = await dns.lookup(hostname, { all: true });
  for (const record of records) {
    if (isPrivateIp(record.address)) {
      throw new Error(`Destination resolves to prohibited IP ${record.address}`);
    }
  }
}

/**
 * Computes the HMAC-SHA256 signature for a webhook payload.
 */
export function computeWebhookSignature(payloadString: string, secret: string): string {
  const hmac = createHmac("sha256", secret).update(payloadString).digest("hex");
  return `sha256=${hmac}`;
}

/**
 * Delivers a single webhook payload to the destination URL with HMAC signing and SSRF protection.
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
    "User-Agent": "GitBowl-Hookshot/2.0",
    "X-GitBowl-Event": event,
    "X-GitBowl-Delivery": webhookId,
    "X-GitHub-Event": event,
    "X-GitHub-Delivery": webhookId,
  };

  if (secret) {
    const sig = computeWebhookSignature(payloadString, secret);
    headers["X-GitBowl-Signature-256"] = sig;
    headers["X-Hub-Signature-256"] = sig;
  }

  let statusCode: number | null = null;
  let responseBody: string | null = null;
  let deliveryError: string | null = null;
  let success = false;

  try {
    // 1. SSRF prevention check right before HTTP dispatch
    await verifyWebhookDestination(url);

    // 2. Strict 5-second delivery timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: payloadString,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    statusCode = res.status;
    success = res.ok;
    responseBody = (await res.text().catch(() => "")).slice(0, 1000);
  } catch (err: any) {
    deliveryError = err.name === "AbortError" ? "Delivery timed out (5s)" : err.message;
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
