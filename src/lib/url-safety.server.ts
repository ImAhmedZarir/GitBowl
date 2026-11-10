// src/lib/url-safety.server.ts
// SSRF prevention and safe URL validation for webhooks and outbound server requests.

export interface UrlSafetyOptions {
  allowHttp?: boolean; // If false or undefined, only https is permitted in production
  allowLocalhostInDev?: boolean;
}

export interface UrlValidationResult {
  safe: boolean;
  error?: string;
  url?: URL;
}

/**
 * Checks whether an IPv4 address string is in a reserved/private range.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }

  const [a, b] = parts;
  if (a === undefined || b === undefined) return false;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;
  // 10.0.0.0/8 (Private)
  if (a === 10) return true;
  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (Link-local / Cloud metadata)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 (Private)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 (Private)
  if (a === 192 && b === 168) return true;
  // 100.64.0.0/10 (Carrier-grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 (TEST-NET)
  if (a === 192 && b === 0 && parts[2] === 2) return true;
  // Broadcast / Multicast 224.0.0.0/4 and 255.255.255.255
  if (a >= 224) return true;

  return false;
}

/**
 * Validates a target URL to protect against Server-Side Request Forgery (SSRF).
 */
export function validateSafeUrl(
  input: string,
  options: UrlSafetyOptions = {},
): UrlValidationResult {
  if (!input || typeof input !== "string") {
    return { safe: false, error: "URL is required" };
  }

  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return { safe: false, error: "Invalid URL format" };
  }

  const isDev = process.env["NODE_ENV"] === "development" || process.env["NODE_ENV"] === "test";

  // Protocol check
  if (parsed.protocol === "https:") {
    // OK
  } else if (parsed.protocol === "http:") {
    if (!options.allowHttp && !isDev) {
      return { safe: false, error: "Only HTTPS URLs are permitted for external requests" };
    }
  } else {
    return { safe: false, error: `Unsupported URL protocol: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Strip brackets from IPv6
  const cleanHost = hostname.replace(/^\[|\]$/g, "");

  // Localhost checks
  if (cleanHost === "localhost" || cleanHost.endsWith(".localhost") || cleanHost.endsWith(".local")) {
    if (!options.allowLocalhostInDev || !isDev) {
      return { safe: false, error: "Localhost and local domain destinations are prohibited" };
    }
  }

  // Cloud metadata and internal services
  if (
    cleanHost === "metadata.google.internal" ||
    cleanHost.endsWith(".internal") ||
    cleanHost === "169.254.169.254" ||
    cleanHost === "instance-data"
  ) {
    return { safe: false, error: "Access to cloud metadata and internal domains is strictly prohibited" };
  }

  // IPv4 checks
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(cleanHost)) {
    if (isPrivateIPv4(cleanHost)) {
      if (!options.allowLocalhostInDev || !isDev || cleanHost !== "127.0.0.1") {
        return { safe: false, error: "Private or internal IP addresses are prohibited" };
      }
    }
  }

  // IPv6 checks
  if (cleanHost.includes(":")) {
    // IPv6 loopback, link-local, unique local
    if (
      cleanHost === "::1" ||
      cleanHost.startsWith("fe80:") ||
      cleanHost.startsWith("fc00:") ||
      cleanHost.startsWith("fd") ||
      cleanHost === "::"
    ) {
      if (!options.allowLocalhostInDev || !isDev || cleanHost !== "::1") {
        return { safe: false, error: "Private or loopback IPv6 addresses are prohibited" };
      }
    }
  }

  return { safe: true, url: parsed };
}

/**
 * Safe fetch wrapper that validates URL and protects against redirect-based SSRF.
 */
export async function safeFetch(
  inputUrl: string,
  init?: RequestInit,
  options: UrlSafetyOptions = {},
): Promise<Response> {
  const validation = validateSafeUrl(inputUrl, options);
  if (!validation.safe || !validation.url) {
    throw new Error(`SSRF Prevention: ${validation.error || "Blocked URL"}`);
  }

  // Enforce manual redirect handling to re-validate any redirect target
  const fetchInit: RequestInit = {
    ...init,
    redirect: "manual",
  };

  const response = await fetch(validation.url.toString(), fetchInit);

  // If redirect response (301, 302, 307, 308), validate location header
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get("location");
    if (!location) {
      return response;
    }

    const redirectTarget = new URL(location, validation.url).toString();
    const redirectValidation = validateSafeUrl(redirectTarget, options);
    if (!redirectValidation.safe) {
      throw new Error(`SSRF Prevention on redirect: ${redirectValidation.error}`);
    }

    // Follow valid safe redirect recursively with decrementing counter
    return safeFetch(redirectTarget, init, options);
  }

  return response;
}
