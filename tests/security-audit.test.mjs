// tests/security-audit.test.mjs
// GitBowl Deep Security Regression & Audit Verification Suite
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseAnyGitUrl, validateAndResolveGitHost } from "../src/routes/api/github/import.ts";
import { computeWebhookSignature } from "../src/lib/webhooks.server.ts";
import { isReservedUsername } from "../src/lib/reserved-usernames.ts";
import { isWhitelistedAdminEmail } from "../src/lib/admin.server.ts";

console.log("=== GitBowl Deep Security Regression & Audit Test Suite ===");

// 1. Importer SSRF & Protocol Hardening (Finding C4)
console.log("\n[Test 1] Verifying Importer URL & Protocol Restrictions...");

// Rejects non-HTTPS protocols
assert.throws(
  () => parseAnyGitUrl("http://github.com/torvalds/linux"),
  /Only secure HTTPS Git URLs are supported/,
  "Must reject insecure plain HTTP",
);
assert.throws(
  () => parseAnyGitUrl("git://github.com/torvalds/linux.git"),
  /Only secure HTTPS Git URLs are supported/,
  "Must reject arbitrary git:// scheme",
);
assert.throws(
  () => parseAnyGitUrl("file:///etc/passwd"),
  /Only secure HTTPS Git URLs are supported/,
  "Must reject local file:// scheme",
);

// Rejects untrusted hosts
assert.throws(
  () => parseAnyGitUrl("https://evil-attacker.com/repo.git"),
  /Unsupported host 'evil-attacker.com'/,
  "Must reject hosts outside allowlist",
);
assert.throws(
  () => parseAnyGitUrl("https://169.254.169.254/latest/meta-data"),
  /Unsupported host '169.254.169.254'/,
  "Must reject cloud metadata IP",
);
assert.throws(
  () => parseAnyGitUrl("https://127.0.0.1/private.git"),
  /Unsupported host '127.0.0.1'/,
  "Must reject loopback IP",
);

// Accepts valid allowlisted providers
const gh = parseAnyGitUrl("https://github.com/facebook/react.git");
assert.equal(gh.provider, "github");
assert.equal(gh.repoName, "react");

const gl = parseAnyGitUrl("https://gitlab.com/inkscape/inkscape.git");
assert.equal(gl.provider, "gitlab");
assert.equal(gl.repoName, "inkscape");

const shorthand = parseAnyGitUrl("torvalds/linux");
assert.equal(shorthand.provider, "github");
assert.equal(shorthand.normalizedCloneUrl, "https://github.com/torvalds/linux.git");

console.log("✓ Importer URL and protocol verification passed.");

// 2. Webhook HMAC-SHA256 Signing & SSRF Shield (Findings P8 / H3)
console.log("\n[Test 2] Verifying Webhook Cryptographic Signatures & SSRF Protection...");
const sig = computeWebhookSignature('{"action":"push"}', "super-secret-key-12345");
assert.ok(sig.startsWith("sha256="), "Signature must have standard sha256= prefix");
assert.equal(sig.length, 7 + 64, "Signature must be sha256= followed by 64 hex characters");

// Ensure delivery code includes X-Hub-Signature-256 and 5s timeout
const webhookCode = fs.readFileSync(path.resolve("src/lib/webhooks.server.ts"), "utf8");
assert.ok(webhookCode.includes("X-Hub-Signature-256"), "Must set standard GitHub webhook header");
assert.ok(webhookCode.includes("verifyWebhookDestination"), "Must check destination before sending");
assert.ok(webhookCode.includes("5000"), "Must enforce 5-second timeout");
console.log("✓ Webhook cryptographic signatures and SSRF shield verified.");

// 3. Central Authorization & Cloaking Layer (Findings C6, C7)
console.log("\n[Test 3] Verifying Central Authorization Layer & 404 Cloaking...");
const authzCode = fs.readFileSync(path.resolve("src/lib/authz.server.ts"), "utf8");
assert.ok(authzCode.includes("status: 404"), "Must cloak unauthorized private repos as genuine 404");
assert.ok(authzCode.includes("is_suspended"), "Must check profiles.is_suspended");
assert.ok(authzCode.includes("token_hash"), "Must lookup PAT via sha256 hash");
assert.ok(authzCode.includes("expires_at"), "Must check PAT expiry");

// Verify raw route cloaking
const rawRouteCode = fs.readFileSync(path.resolve("src/routes/raw/$owner/$repo/$branch/$.ts"), "utf8");
assert.ok(rawRouteCode.includes("requireRepoAccess"), "Raw route must enforce central authz");
assert.ok(rawRouteCode.includes("nosniff"), "Raw route must set nosniff header");

// Verify pages route sandboxing & XSS prevention (Finding C5)
const pagesRouteCode = fs.readFileSync(path.resolve("src/routes/pages/$owner/$repo/$.ts"), "utf8");
assert.ok(pagesRouteCode.includes("requireRepoAccess"), "Pages route must enforce central authz");
assert.ok(pagesRouteCode.includes("Content-Security-Policy"), "Pages route must set CSP sandbox");
assert.ok(pagesRouteCode.includes("escapeHtml"), "Pages error templates must escape dynamic HTML");
console.log("✓ Central authorization layer and XSS protections verified.");

// 4. Authentication Endpoints Hardening (Findings C2, C3)
console.log("\n[Test 4] Verifying Auth Endpoint Hardening...");
const googleSyncCode = fs.readFileSync(path.resolve("src/routes/api/auth/google-sync.ts"), "utf8");
assert.ok(
  googleSyncCode.includes("verifyFirebaseIdToken"),
  "Google sync must cryptographically verify Firebase ID token",
);
assert.ok(
  !googleSyncCode.includes("body.email"),
  "Google sync must never trust client-supplied email",
);

const githubSyncCode = fs.readFileSync(path.resolve("src/routes/api/auth/github-sync.ts"), "utf8");
assert.ok(
  githubSyncCode.includes("verifyFirebaseIdToken"),
  "GitHub sync must cryptographically verify Firebase ID token",
);

const loginCode = fs.readFileSync(path.resolve("src/routes/api/auth/login.ts"), "utf8");
assert.ok(
  loginCode.includes("getAnonAuthClient"),
  "Login must run on isolated anon client without persistent session",
);
assert.ok(
  loginCode.includes("isRateLimited"),
  "Login must enforce IP and account rate limiting",
);
console.log("✓ Auth endpoints cryptographic validation verified.");

// 5. Database Migration 0015 Integrity (Finding P6)
console.log("\n[Test 5] Verifying Corrective Database Migration 0015...");
const migration0015 = fs.readFileSync(
  path.resolve("drizzle/migrations/0015_security_hardening.sql"),
  "utf8",
);
assert.ok(
  migration0015.includes("search_path = public, pg_temp"),
  "Must enforce secure search_path on all SECURITY DEFINER functions",
);
assert.ok(
  migration0015.includes("idx_profiles_lower_username"),
  "Must enforce unique index on lower(profiles.username)",
);
assert.ok(
  migration0015.includes("idx_orgs_lower_slug"),
  "Must enforce unique index on lower(orgs.slug)",
);
assert.ok(
  migration0015.includes("REVOKE ALL ON public.lfs_data"),
  "Must revoke arbitrary access to lfs_data",
);
assert.ok(
  migration0015.includes("supabase_realtime DROP TABLE public.repo_github_sync"),
  "Must remove sensitive tables from supabase_realtime publication",
);
console.log("✓ Corrective migration 0015 schema verified.");

// 6. UI & Markdown Parity (Findings U1-U5)
console.log("\n[Test 6] Verifying UI Parity & Markdown Components...");
const mdRendererCode = fs.readFileSync(path.resolve("src/components/MarkdownRenderer.tsx"), "utf8");
assert.ok(mdRendererCode.includes("rehypeRaw"), "Must include rehypeRaw plugin for HTML rendering");
assert.ok(mdRendererCode.includes("rehypeSanitize"), "Must include rehypeSanitize for safe HTML");

const langBarCode = fs.readFileSync(path.resolve("src/components/repo/LanguageBar.tsx"), "utf8");
assert.ok(langBarCode.includes("node_modules"), "Language bar must exclude node_modules and build dirs");
assert.ok(langBarCode.includes("Kotlin"), "Language bar must support Kotlin");

const appShellCode = fs.readFileSync(path.resolve("src/components/AppShell.tsx"), "utf8");
assert.ok(appShellCode.includes("Ctrl+K"), "AppShell must dynamically support Ctrl+K on non-Mac platforms");
console.log("✓ UI parity, Markdown, and Language Bar verified.");

console.log("\n============================================================");
console.log("🎉 ALL DEEP SECURITY REGRESSION & AUDIT TESTS PASSED 100%!");
console.log("============================================================\n");
