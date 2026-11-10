// src/lib/username.ts
// Comprehensive username normalization, validation, reserved handle checking, and suggestion helpers.

export const USERNAME_REGEX = /^[a-z0-9]([a-z0-9-]{1,37}[a-z0-9])?$/;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 39;

export const RESERVED_USERNAMES = new Set([
  // Core routes & system identifiers
  "about",
  "account",
  "admin",
  "administrator",
  "api",
  "app",
  "assets",
  "auth",
  "billing",
  "blob",
  "blog",
  "bowl",
  "branches",
  "callback",
  "checkout",
  "clone",
  "commit",
  "commits",
  "contact",
  "dashboard",
  "developer",
  "developers",
  "docs",
  "documentation",
  "email",
  "enterprise",
  "events",
  "explore",
  "faq",
  "favicon",
  "feedback",
  "features",
  "git",
  "gitbowl",
  "gitbowlusercontent",
  "help",
  "hooks",
  "info",
  "internal",
  "invitations",
  "issues",
  "jobs",
  "join",
  "legal",
  "login",
  "logout",
  "mail",
  "marketplace",
  "new",
  "news",
  "notifications",
  "oauth",
  "og",
  "org",
  "orgs",
  "organization",
  "organizations",
  "pages",
  "password",
  "plans",
  "popular",
  "pricing",
  "privacy",
  "profile",
  "public",
  "pull",
  "pulls",
  "raw",
  "recover",
  "register",
  "repo",
  "repos",
  "repositories",
  "reset",
  "reset-password",
  "robots",
  "root",
  "search",
  "security",
  "sessions",
  "settings",
  "signin",
  "signout",
  "signup",
  "sitemap",
  "ssh",
  "stars",
  "static",
  "status",
  "subscriptions",
  "support",
  "sw",
  "sysadmin",
  "system",
  "tags",
  "teams",
  "terms",
  "tos",
  "trending",
  "user",
  "users",
  "v1",
  "v2",
  "verify",
  "webhook",
  "webhooks",
  "wiki",
  "www",
]);

export function normalizeUsername(input: string): string {
  return (input || "").trim().toLowerCase();
}

export function isReservedUsername(username: string): boolean {
  const normalized = normalizeUsername(username);
  return RESERVED_USERNAMES.has(normalized);
}

export interface UsernameValidationResult {
  valid: boolean;
  error?: string;
}

export function validateUsername(username: string): UsernameValidationResult {
  const normalized = normalizeUsername(username);

  if (!normalized) {
    return { valid: false, error: "Username is required" };
  }

  if (normalized.length < USERNAME_MIN_LENGTH) {
    return {
      valid: false,
      error: `Username must be at least ${USERNAME_MIN_LENGTH} characters`,
    };
  }

  if (normalized.length > USERNAME_MAX_LENGTH) {
    return {
      valid: false,
      error: `Username must be at most ${USERNAME_MAX_LENGTH} characters`,
    };
  }

  if (normalized.includes("_")) {
    return {
      valid: false,
      error: "Username cannot contain underscores; only lowercase letters, numbers, and hyphens",
    };
  }

  if (normalized.includes("--")) {
    return {
      valid: false,
      error: "Username cannot contain consecutive hyphens",
    };
  }

  if (normalized.startsWith("-") || normalized.endsWith("-")) {
    return {
      valid: false,
      error: "Username cannot start or end with a hyphen",
    };
  }

  if (!USERNAME_REGEX.test(normalized)) {
    return {
      valid: false,
      error:
        "Username may only contain lowercase letters, numbers, and single hyphens (3-39 characters)",
    };
  }

  if (isReservedUsername(normalized)) {
    return {
      valid: false,
      error: `'${normalized}' is a reserved handle on GitBowl`,
    };
  }

  return { valid: true };
}

/**
 * Derives a clean, compliant candidate username from arbitrary input (e.g. email, display name).
 */
export function sanitizeUsernameCandidate(raw: string): string {
  let base = raw
    .toLowerCase()
    .trim()
    .replace(/@.*$/, "") // strip email domain if present
    .replace(/[^a-z0-9-]+/g, "-") // replace non-alphanumeric with hyphen
    .replace(/-+/g, "-") // collapse consecutive hyphens
    .replace(/^-+|-+$/g, ""); // strip leading and trailing hyphens

  if (!base) {
    base = "user";
  }

  if (base.length < USERNAME_MIN_LENGTH) {
    base = `user-${base}`;
  }

  if (base.length > USERNAME_MAX_LENGTH) {
    base = base.slice(0, USERNAME_MAX_LENGTH).replace(/-+$/, "");
  }

  if (isReservedUsername(base)) {
    base = `${base}-dev`;
    if (base.length > USERNAME_MAX_LENGTH) {
      base = base.slice(0, USERNAME_MAX_LENGTH).replace(/-+$/, "");
    }
  }

  return base;
}

/**
 * Suggests available alternative variations of a given base username.
 */
export function suggestUsernameAlternatives(base: string): string[] {
  const candidate = sanitizeUsernameCandidate(base);
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  const currentYear = new Date().getFullYear();

  const options = [
    candidate,
    `${candidate}${randomSuffix}`,
    `${candidate}-dev`,
    `${candidate}${currentYear % 100}`,
  ];

  return Array.from(
    new Set(
      options
        .map((opt) => sanitizeUsernameCandidate(opt))
        .filter((opt) => validateUsername(opt).valid),
    ),
  );
}
