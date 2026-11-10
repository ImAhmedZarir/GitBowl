// src/lib/safe-redirect.ts
// Prevents open-redirect vulnerabilities by strictly validating and sanitizing redirect targets.

/**
 * Validates a redirect target and returns a safe, relative path.
 * If the provided target is invalid, untrusted, or external, returns the fallback path.
 */
export function getSafeRedirect(
  target: unknown,
  fallback = "/",
): string {
  if (typeof target !== "string" || !target.trim()) {
    return fallback;
  }

  const trimmed = target.trim();

  // Must begin with a single forward slash
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return fallback;
  }

  // Reject URLs containing backslashes, whitespace, or control characters
  // eslint-disable-next-line no-control-regex
  if (/[\s\r\n\t\x00-\x1F\x7F\\]/.test(trimmed)) {
    return fallback;
  }

  // Reject dangerous schemes or protocol-relative constructs encoded or plain
  if (
    /^(?:[a-z0-9+.-]+:|\/\/)/i.test(trimmed) ||
    /javascript:/i.test(trimmed) ||
    /data:/i.test(trimmed) ||
    /vbscript:/i.test(trimmed)
  ) {
    return fallback;
  }

  try {
    // Parse using dummy base to ensure it resolves to the exact same origin path
    const parsed = new URL(trimmed, "http://localhost");
    if (parsed.origin !== "http://localhost") {
      return fallback;
    }

    // Path must start with single slash and not double slashes
    if (!parsed.pathname.startsWith("/") || parsed.pathname.startsWith("//")) {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

/**
 * Returns true if the target is a valid relative application path.
 */
export function isSafeRedirect(target: unknown): boolean {
  if (typeof target !== "string") return false;
  return getSafeRedirect(target, "__INVALID__") !== "__INVALID__";
}
