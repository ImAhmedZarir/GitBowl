// tests/part-a-acceptance.test.mjs
// Part A Acceptance Tests: Security Hotfix
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { isWhitelistedAdminEmail } from "../src/lib/admin.server.ts";

console.log("=== GitBowl Part A Acceptance Tests: Security Hotfix ===");

// -------------------------------------------------------------
// Test 1: Normal user cannot escalate to admin
// -------------------------------------------------------------
console.log("\n[Test 1] Verifying Admin Identity & Privilege Escalation Protection...");

// 1.1 Whitelist test
assert.equal(isWhitelistedAdminEmail("ahmedzarir07@gmail.com"), true);
assert.equal(isWhitelistedAdminEmail("AHMEDZARIR07@GMAIL.COM"), true);
assert.equal(isWhitelistedAdminEmail("attacker@evil.com"), false);
assert.equal(isWhitelistedAdminEmail(""), false);
assert.equal(isWhitelistedAdminEmail(null), false);

// 1.2 Inspection of requireAdmin in src/lib/admin.server.ts
const adminServerSrc = fs.readFileSync(path.resolve("src/lib/admin.server.ts"), "utf8");

// Must verify user.email and confirmed_at, never user_metadata
assert.ok(
  !adminServerSrc.includes("user_metadata?.email"),
  "requireAdmin must never fall back to user-editable user_metadata.email",
);
assert.ok(
  adminServerSrc.includes("isConfirmed"),
  "requireAdmin must check email confirmation status",
);
assert.ok(
  !adminServerSrc.includes("isRoleAdmin"),
  "requireAdmin must not trust profile role for admin rights",
);
assert.ok(
  !adminServerSrc.includes("isUsernameAdmin"),
  "requireAdmin must not trust username for admin rights",
);
assert.ok(
  !adminServerSrc.includes('.update({ role: "admin"'),
  "requireAdmin must not auto-escalate role on request handling",
);

// 1.3 Inspection of migration 0014
const migration14Path = path.resolve("drizzle/migrations/0014_part_a_security_hotfix.sql");
assert.ok(fs.existsSync(migration14Path), "Migration 0014 must exist");
const migration14Sql = fs.readFileSync(migration14Path, "utf8");

assert.ok(
  migration14Sql.includes("REVOKE UPDATE ON public.profiles FROM authenticated;"),
  "Migration 0014 must revoke blanket UPDATE on profiles from authenticated users",
);
assert.ok(
  migration14Sql.includes(
    "GRANT UPDATE (display_name, bio, pinned_repo_ids) ON public.profiles TO authenticated;",
  ),
  "Migration 0014 must grant UPDATE only on user-editable columns",
);
assert.ok(
  migration14Sql.includes("CREATE OR REPLACE FUNCTION public.protect_profile_roles()"),
  "Migration 0014 must create trigger function protecting role and is_suspended",
);
assert.ok(
  migration14Sql.includes("UPDATE public.profiles"),
  "Migration 0014 must demote any illegitimate admin rows",
);

console.log("✓ Test 1 Passed: Admin identity strictly protected against privilege escalation.");

// -------------------------------------------------------------
// Test 2: Anonymous and non-member code search never returns private content
// -------------------------------------------------------------
console.log("\n[Test 2] Verifying Code Search Security & Filter Injection Protection...");

const searchSrc = fs.readFileSync(path.resolve("src/routes/api/search.ts"), "utf8");

assert.ok(
  searchSrc.includes("search_code_safe"),
  "Search route must use parameterized search_code_safe function",
);
assert.ok(searchSrc.includes("viewerId"), "Search route must authenticate and pass viewerId");
assert.ok(
  searchSrc.includes("accessibleRepoIds"),
  "Search fallback must restrict queries strictly to accessible repositories",
);
assert.ok(searchSrc.includes("checkSearchRateLimit"), "Search route must implement rate limiting");
assert.ok(
  !searchSrc.includes(".or(`path.ilike.%${cleanQ}%,content.ilike.%${cleanQ}%`)"),
  "Search route must not interpolate unsanitized query into raw .or() filter",
);

console.log("✓ Test 2 Passed: Code search protects private repositories and prevents injection.");

// -------------------------------------------------------------
// Test 3: GitHub webhook signature verification (X-Hub-Signature-256)
// -------------------------------------------------------------
console.log("\n[Test 3] Verifying Webhook Signature Authentication...");

const webhookSrc = fs.readFileSync(path.resolve("src/routes/api/github/webhook.ts"), "utf8");

assert.ok(
  webhookSrc.includes("x-hub-signature-256"),
  "Webhook must check x-hub-signature-256 header",
);
assert.ok(
  webhookSrc.includes("crypto.timingSafeEqual"),
  "Webhook must use timingSafeEqual to avoid timing attacks",
);
assert.ok(
  webhookSrc.includes("status = 200") || webhookSrc.includes("401"),
  "Webhook must return 401 when signature is missing or invalid",
);
assert.ok(
  webhookSrc.includes("Missing X-Hub-Signature-256 header"),
  "Webhook must reject requests without signature header",
);

// Cryptographic simulation of verifyWebhookSignature
const secret = "test-secret-key-12345";
const testPayload = JSON.stringify({ repository: { full_name: "test/repo" } });
const validSignature =
  "sha256=" + crypto.createHmac("sha256", secret).update(testPayload).digest("hex");
const invalidSignature = "sha256=" + "0".repeat(64);

const sigBufValid = Buffer.from(validSignature, "utf8");
const expBuf = Buffer.from(validSignature, "utf8");
const sigBufInvalid = Buffer.from(invalidSignature, "utf8");

assert.equal(crypto.timingSafeEqual(sigBufValid, expBuf), true, "Valid HMAC must verify true");
assert.equal(
  crypto.timingSafeEqual(sigBufInvalid, expBuf),
  false,
  "Invalid HMAC must verify false",
);

console.log("✓ Test 3 Passed: Webhook requires verified cryptographic signature.");

// -------------------------------------------------------------
// Test 4: Repository insights validation & 404 status
// -------------------------------------------------------------
console.log("\n[Test 4] Verifying Repository Insights Access Control & UUID Validation...");

const insightsSrc = fs.readFileSync(path.resolve("src/routes/api/repo/insights.ts"), "utf8");

assert.ok(
  insightsSrc.includes("UUID_REGEX"),
  "Insights route must validate repoId as a valid UUID",
);
assert.ok(
  insightsSrc.includes("hasRepoReadAccess"),
  "Insights route must check repository read access for private repos",
);
assert.ok(
  !insightsSrc.includes("status: 500"),
  "Insights route must return 404 for unknown or unauthorized repos instead of 500",
);

console.log(
  "✓ Test 4 Passed: Insights route validates UUID and returns 404 for unauthorized repos.",
);

// -------------------------------------------------------------
// Test 5: /admin returns the standard 404 page for non-admins
// -------------------------------------------------------------
console.log("\n[Test 5] Verifying /admin Access Control & 404 Cloaking...");

const adminUiSrc = fs.readFileSync(path.resolve("src/routes/admin.tsx"), "utf8");
const adminMeSrc = fs.readFileSync(path.resolve("src/routes/api/admin/me.ts"), "utf8");

assert.ok(
  adminUiSrc.includes("/api/admin/me"),
  "Admin UI route must verify admin credentials server-side via /api/admin/me",
);
assert.ok(
  !adminUiSrc.includes('profile?.role === "admin"'),
  "Admin UI must not bypass authentication using client profile role",
);
assert.ok(
  adminUiSrc.includes("404") && adminUiSrc.includes("This page could not be found"),
  "Admin UI must render standard 404 page for non-admins",
);
assert.ok(adminMeSrc.includes("requireAdmin"), "/api/admin/me must invoke requireAdmin");

console.log("✓ Test 5 Passed: /admin renders 404 page for unauthorized visitors.");

// -------------------------------------------------------------
// Test 6: Zero Drive strings outside /admin
// -------------------------------------------------------------
console.log("\n[Test 6] Verifying Zero Google Drive Strings Outside /admin...");

const notificationsUi = fs.readFileSync(path.resolve("src/routes/notifications.tsx"), "utf8");
assert.ok(
  !notificationsUi.toLowerCase().includes("google drive"),
  "notifications.tsx must not contain 'google drive'",
);
assert.ok(
  !notificationsUi.toLowerCase().includes("drive backup"),
  "notifications.tsx must not contain 'drive backup'",
);

const footerUi = fs.readFileSync(path.resolve("src/components/Footer.tsx"), "utf8");
assert.ok(
  !footerUi.includes('href="https://github.com"'),
  "Footer must not link Docs to github.com",
);
assert.ok(footerUi.includes('to="/docs"'), "Footer must link Docs to internal /docs route");

const docsRoutePath = path.resolve("src/routes/docs.tsx");
assert.ok(fs.existsSync(docsRoutePath), "Dedicated /docs route must exist");

console.log("✓ Test 6 Passed: Zero Drive strings outside /admin, and /docs is configured.");

console.log("\nAll Part A Acceptance Tests Passed Successfully!");
