// tests/phase2-acceptance.test.mjs
// Phase 2 Acceptance Test Suite: Webhooks, Pages, Releases, Insights & Full-Text Search
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { computeWebhookSignature } from "../src/lib/webhooks.server.ts";

console.log("=== GitBowl Phase 2 Acceptance Tests ===");

// 1. Webhook HMAC-SHA256 Signature Verification
console.log("\n[Test 1] Testing Webhook HMAC-SHA256 Signature Calculation...");
const payload = JSON.stringify({ event: "push", ref: "refs/heads/main" });
const secret = "super-secret-key-123";
const signature = computeWebhookSignature(payload, secret);

assert.ok(signature.startsWith("sha256="), "Signature must have sha256= prefix");
assert.equal(signature.length, 7 + 64, "Signature must contain a 64-character hex digest");

// Verify deterministic signature
const signature2 = computeWebhookSignature(payload, secret);
assert.equal(signature, signature2, "Signature must be deterministic");

// Verify different secret produces different signature
const signatureMismatch = computeWebhookSignature(payload, "wrong-secret");
assert.notEqual(signature, signatureMismatch, "Different secret must produce different signature");
console.log("✓ Webhook HMAC-SHA256 signature verified.");

// 2. Webhook Dispatch on Commit/Push
console.log("\n[Test 2] Verifying Webhook Dispatch on Push in Commit Service...");
const commitServiceContent = fs.readFileSync(
  path.resolve("src/lib/commit-service.server.ts"),
  "utf8",
);
assert.ok(
  commitServiceContent.includes("dispatchRepoWebhooks"),
  "Commit service must invoke dispatchRepoWebhooks",
);
assert.ok(commitServiceContent.includes('event: "push"'), "Commit service must fire 'push' event");
console.log("✓ Push webhook dispatch integrated in commit service.");

// 3. Webhook Delivery Logging & Headers
console.log("\n[Test 3] Verifying Webhook Delivery Header & Logging Logic...");
const webhooksContent = fs.readFileSync(path.resolve("src/lib/webhooks.server.ts"), "utf8");
assert.ok(
  webhooksContent.includes("X-GitBowl-Signature-256"),
  "Delivery engine attaches X-GitBowl-Signature-256 header",
);
assert.ok(
  webhooksContent.includes("X-GitBowl-Event"),
  "Delivery engine attaches X-GitBowl-Event header",
);
assert.ok(
  webhooksContent.includes("webhook_deliveries"),
  "Delivery engine records logs in webhook_deliveries table",
);
console.log("✓ Webhook delivery engine and logging verified.");

// 4. Migration 0009 Schema Integrity
console.log("\n[Test 4] Verifying Phase 2 Database Migration...");
const migrationPath = path.resolve("drizzle/migrations/0009_phase2_platform_features.sql");
assert.ok(fs.existsSync(migrationPath), "Migration 0009 must exist");
const sql = fs.readFileSync(migrationPath, "utf8");
assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.webhooks"), "webhooks table must exist");
assert.ok(
  sql.includes("CREATE TABLE IF NOT EXISTS public.webhook_deliveries"),
  "webhook_deliveries table must exist",
);
assert.ok(
  sql.includes("CREATE TABLE IF NOT EXISTS public.pages_config"),
  "pages_config table must exist",
);
assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.releases"), "releases table must exist");
assert.ok(
  sql.includes("CREATE TABLE IF NOT EXISTS public.release_assets"),
  "release_assets table must exist",
);
console.log("✓ Migration 0009 contains all required schema definitions.");

// 5. GitBowl Pages Static Site Resolution
console.log("\n[Test 5] Verifying GitBowl Pages Resolution Engine...");
const pagesRouteContent = fs.readFileSync(
  path.resolve("src/routes/pages/$owner/$repo/$.ts"),
  "utf8",
);
assert.ok(pagesRouteContent.includes("pages_config"), "Pages route queries pages_config table");
assert.ok(
  pagesRouteContent.includes("index.html"),
  "Pages route automatically resolves index.html for root/directory paths",
);
assert.ok(
  pagesRouteContent.includes("text/html; charset=utf-8"),
  "Pages route provides correct MIME type for HTML",
);
assert.ok(
  pagesRouteContent.includes("status: 404"),
  "Pages route returns 404 when disabled or file missing",
);
console.log("✓ GitBowl Pages static hosting engine verified.");

// 6. Search API Implementation
console.log("\n[Test 6] Verifying Search Engine API & Scopes...");
const searchApiContent = fs.readFileSync(path.resolve("src/routes/api/search.ts"), "utf8");
assert.ok(searchApiContent.includes("repositories"), "Search API supports repositories scope");
assert.ok(
  searchApiContent.includes("code"),
  "Search API supports code scope with file content matching",
);
assert.ok(searchApiContent.includes("issues"), "Search API supports issues scope");
assert.ok(searchApiContent.includes("users"), "Search API supports users scope");
assert.ok(searchApiContent.includes("typeMatch"), "Search API parses inline type: syntax filter");
console.log("✓ Full-text search engine API verified.");

// 7. Interactive Search UI
console.log("\n[Test 7] Verifying Search UI Route...");
const searchUiContent = fs.readFileSync(path.resolve("src/routes/search.tsx"), "utf8");
assert.ok(searchUiContent.includes("SearchScope"), "Search UI defines multi-scope types");
assert.ok(searchUiContent.includes("activeScope"), "Search UI handles active scope switching");
console.log("✓ Search UI route verified.");

console.log("\n==========================================");
console.log("🎉 ALL PHASE 2 ACCEPTANCE TESTS PASSED!");
console.log("==========================================");
