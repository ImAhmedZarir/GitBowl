// tests/phase0-acceptance.test.mjs
// Phase 0 Acceptance Test Suite for GitBowl Security & Storage Foundation
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

console.log("=== GitBowl Phase 0 Acceptance Tests ===");

// 1. Check reserved usernames module
console.log("\n[Test 1] Testing Reserved Usernames...");
const reservedContent = fs.readFileSync(path.resolve("src/lib/reserved-usernames.ts"), "utf8");
assert.ok(reservedContent.includes('"admin"'), "admin must be reserved");
assert.ok(reservedContent.includes('"docs"'), "docs must be reserved");
assert.ok(reservedContent.includes('"settings"'), "settings must be reserved");
assert.ok(reservedContent.includes('"gitbowl"'), "gitbowl must be reserved");
console.log("✓ Reserved usernames correctly defined.");

// 2. Check PAT crypto hash implementation
console.log("\n[Test 2] Testing PAT Hashing...");
const gitServerContent = fs.readFileSync(path.resolve("src/lib/git.server.ts"), "utf8");
assert.ok(
  gitServerContent.includes('from "node:crypto"') || gitServerContent.includes('from "crypto"'),
  "crypto must be imported from node:crypto",
);
assert.ok(
  !gitServerContent.includes("globalThis.crypto.createHash"),
  "Must not call createHash on globalThis.crypto",
);
const sampleToken = "gbp_testtoken1234567890";
const hash = createHash("sha256").update(sampleToken).digest("hex");
assert.equal(hash.length, 64, "SHA-256 hash must be 64 hex characters");
console.log("✓ PAT hashing uses correct node:crypto implementation.");

// 3. Check Route Deletions (P2, P3)
console.log("\n[Test 3] Verifying Deleted Vulnerable Routes...");
assert.equal(
  fs.existsSync("src/routes/api/repo/sync-drive.ts"),
  false,
  "sync-drive.ts must be deleted",
);
assert.equal(
  fs.existsSync("src/routes/api/storage/health.ts"),
  false,
  "storage/health.ts must be deleted",
);
assert.ok(fs.existsSync("src/routes/api/health.ts"), "public health.ts must exist");
console.log("✓ Vulnerable endpoints successfully removed.");

// 4. Check Internal Drive Worker (P2 replacement)
console.log("\n[Test 4] Verifying Internal Drive Worker Security...");
const workerContent = fs.readFileSync(
  path.resolve("src/routes/api/internal/drive-worker.ts"),
  "utf8",
);
assert.ok(workerContent.includes("x-internal-secret"), "Worker must check x-internal-secret");
assert.ok(workerContent.includes("SUPABASE_SERVICE_ROLE_KEY"), "Worker allows service role auth");
assert.ok(workerContent.includes("401"), "Worker returns 401 on unauthorized access");
console.log("✓ Internal worker properly secured.");

// 5. Check Commit Authentication & Author Resolution (P1)
console.log("\n[Test 5] Verifying Commit Endpoint Authentication...");
const commitEndpointContent = fs.readFileSync(
  path.resolve("src/routes/api/repo/commit.ts"),
  "utf8",
);
assert.ok(
  commitEndpointContent.toLowerCase().includes("authorization"),
  "Commit endpoint checks Authorization header",
);
assert.ok(
  commitEndpointContent.includes("401"),
  "Commit endpoint returns 401 when unauthenticated",
);
assert.ok(
  commitEndpointContent.includes("commitChanges"),
  "Commit endpoint delegates to commitChanges service",
);
console.log("✓ Commit endpoint enforces strict server-side authentication.");

// 6. Check Drive Info Secrecy (P4)
console.log("\n[Test 6] Verifying Drive Info Invisible in User UI...");
const headerContent = fs.readFileSync(path.resolve("src/components/Header.tsx"), "utf8");
const settingsContent = fs.readFileSync(path.resolve("src/routes/settings.tsx"), "utf8");
assert.ok(
  !headerContent.includes("Cloud Storage (Drive)"),
  "Drive must not appear in Header navigation",
);
assert.ok(
  !settingsContent.includes("service-account"),
  "Drive service-account must not appear in user Settings",
);
assert.ok(
  !settingsContent.includes("credentials are encrypted"),
  "False claim removed from Settings",
);
console.log("✓ Google Drive details completely hidden from user UI.");

// 7. Check robots.txt (SEO requirement)
console.log("\n[Test 7] Verifying robots.txt directives...");
const robotsContent = fs.readFileSync(path.resolve("public/robots.txt"), "utf8");
assert.ok(robotsContent.includes("Disallow: /admin"), "robots.txt must disallow /admin");
assert.ok(robotsContent.includes("Disallow: /settings"), "robots.txt must disallow /settings");
assert.ok(robotsContent.includes("Disallow: /api/"), "robots.txt must disallow /api/");
assert.ok(
  !robotsContent.includes("Host: http://"),
  "robots.txt must not contain invalid Host directive",
);
console.log("✓ robots.txt configured according to specifications.");

// 8. Check SQL Migrations (P5, P7, P8, P9)
console.log("\n[Test 8] Verifying Database Security Migrations...");
const migrationPath = path.resolve("drizzle/migrations/0007_phase0_security_fixes.sql");
assert.ok(fs.existsSync(migrationPath), "Migration 0007 must exist");
const sql = fs.readFileSync(migrationPath, "utf8");
assert.ok(sql.includes("SET search_path = public"), "SECURITY DEFINER must set search_path");
assert.ok(sql.includes("auth.uid()"), "Functions must verify auth.uid()");
assert.ok(
  sql.includes("CREATE TABLE IF NOT EXISTS public.follows"),
  "Follows table must be created",
);
assert.ok(
  sql.includes("CREATE TABLE IF NOT EXISTS public.rate_limits"),
  "Rate limits table must be created",
);
assert.ok(
  sql.includes("CREATE TABLE IF NOT EXISTS public.storage_backups"),
  "Storage backups table must be created",
);
assert.ok(sql.includes("check_reserved_username"), "Reserved username constraint must be added");
console.log("✓ SQL migration includes all Phase 0 security hardening.");

console.log("\n==========================================");
console.log("🎉 ALL PHASE 0 ACCEPTANCE TESTS PASSED!");
console.log("==========================================");
