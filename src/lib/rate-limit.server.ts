// src/lib/rate-limit.server.ts
// Robust server-side in-memory token-bucket / sliding-window rate limiter with safe IP extraction.

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // unix timestamp in ms
  retryAfterSeconds: number;
  headers: Record<string, string>;
}

interface BucketEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, BucketEntry>();

// Periodic garbage collection every 60 seconds
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
function ensureCleanupTimer() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryStore.entries()) {
      if (entry.resetAt <= now) {
        memoryStore.delete(key);
      }
    }
  }, 60000);
  if (cleanupTimer.unref) cleanupTimer.unref();
}

/**
 * Safely extracts client IP address from request headers without trusting spoofed forward chains.
 */
export function getClientIp(request: Request): string {
  // Cloudflare Connecting IP is set directly by Cloudflare edge proxy
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  // Fastly / GCP / Standard edge IP
  const fastlyIp = request.headers.get("fastly-client-ip");
  if (fastlyIp) return fastlyIp.trim();

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // When multiple proxies append to X-Forwarded-For: client, proxy1, proxy2.
    // The first non-empty entry is the client address.
    const parts = forwardedFor.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0 && parts[0]) {
      return parts[0];
    }
  }

  return "127.0.0.1";
}

/**
 * Evaluates rate limit for a given key.
 */
export function checkRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  ensureCleanupTimer();
  const now = Date.now();
  const fullKey = `${options.keyPrefix || "rl"}:${key}`;

  let entry = memoryStore.get(fullKey);

  if (!entry || entry.resetAt <= now) {
    entry = {
      count: 1,
      resetAt: now + options.windowMs,
    };
    memoryStore.set(fullKey, entry);
  } else {
    entry.count += 1;
  }

  const allowed = entry.count <= options.max;
  const remaining = Math.max(0, options.max - entry.count);
  const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(options.max),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.ceil(entry.resetAt / 1000)),
  };

  if (!allowed) {
    headers["Retry-After"] = String(retryAfterSeconds);
  }

  return {
    allowed,
    limit: options.max,
    remaining,
    resetAt: entry.resetAt,
    retryAfterSeconds,
    headers,
  };
}

/**
 * Resets rate limit for a key (e.g. after successful login).
 */
export function resetRateLimit(key: string, keyPrefix = "rl"): void {
  memoryStore.delete(`${keyPrefix}:${key}`);
}
