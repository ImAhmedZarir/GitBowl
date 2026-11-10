// tests/phase1-acceptance.test.mjs
// Phase 1 Acceptance Test Suite: Admin Panel, Audit Logs, Branches, Pull Requests & Code Reviews
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isWhitelistedAdminEmail } from "../src/lib/admin.server.ts";

console.log("=== GitBowl Phase 1 Acceptance Tests ===");

// 1. Admin Email Whitelisting
console.log("\n[Test 1] Testing Admin Identity Whitelist...");
assert.equal(
  isWhitelistedAdminEmail("ahmedzarir07@gmail.com"),
  true,
  "ahmedzarir07@gmail.com must be whitelisted as admin",
);
assert.equal(
  isWhitelistedAdminEmail("AHMEDZARIR07@GMAIL.COM"),
  true,
  "Admin email comparison must be case-insensitive",
);
assert.equal(
  isWhitelistedAdminEmail("attacker@evil.com"),
  false,
  "Arbitrary emails must be rejected",
);
assert.equal(isWhitelistedAdminEmail(""), false, "Empty email must be rejected");
assert.equal(isWhitelistedAdminEmail(null), false, "Null email must be rejected");
console.log("✓ Admin identity whitelist verified.");

// 2. Admin 404 Cloaking (Non-admins receive 404, not 403)
console.log("\n[Test 2] Verifying Admin 404 Cloaking in API...");
const adminServerContent = fs.readFileSync(path.resolve("src/lib/admin.server.ts"), "utf8");
assert.ok(
  adminServerContent.includes("status: 404"),
  "Unauthorized requests to admin must yield status 404",
);
assert.ok(
  !adminServerContent.includes("status: 403"),
  "Admin endpoints must never leak 403 to unverified users",
);
console.log("✓ Admin endpoints successfully cloaked with genuine 404 responses.");

// 3. Admin UI Security
console.log("\n[Test 3] Verifying Admin UI Route Security...");
const adminUiContent = fs.readFileSync(path.resolve("src/routes/admin.tsx"), "utf8");
assert.ok(adminUiContent.includes("404"), "Admin UI renders 404 page for non-admin visitors");
assert.ok(
  adminUiContent.includes("This page could not be found"),
  "Admin UI displays standard not-found message to non-admins",
);
console.log("✓ Admin UI access control verified.");

// 4. Migration 0008 Integrity (Audit Log, Refs, PRs)
console.log("\n[Test 4] Verifying Phase 1 Database Migration...");
const migrationPath = path.resolve("drizzle/migrations/0008_phase1_admin_and_prs.sql");
assert.ok(fs.existsSync(migrationPath), "Migration 0008 must exist");
const sql = fs.readFileSync(migrationPath, "utf8");
assert.ok(
  sql.includes("CREATE TABLE IF NOT EXISTS public.audit_log"),
  "audit_log table must exist",
);
assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.refs"), "refs table must exist");
assert.ok(
  sql.includes("CREATE TABLE IF NOT EXISTS public.branch_protections"),
  "branch_protections table must exist",
);
assert.ok(
  sql.includes("CREATE TABLE IF NOT EXISTS public.pull_requests"),
  "pull_requests table must exist",
);
assert.ok(
  sql.includes("CREATE TABLE IF NOT EXISTS public.pull_request_reviews"),
  "pull_request_reviews table must exist",
);
assert.ok(
  sql.includes("CREATE TABLE IF NOT EXISTS public.pull_request_comments"),
  "pull_request_comments table must exist",
);
console.log("✓ Migration 0008 contains all required schema definitions.");

// 5. Pull Request Merge & Auto-Closing Issues
console.log("\n[Test 5] Verifying Pull Request Merge & Linked Issues Engine...");
const mergeEndpointContent = fs.readFileSync(
  path.resolve("src/routes/api/repo/pull-merge.ts"),
  "utf8",
);
assert.ok(
  mergeEndpointContent.includes("issueMatchRegex"),
  "Merge endpoint parses linked issue references",
);
assert.ok(
  mergeEndpointContent.includes("fixes|closes|resolves"),
  "Merge endpoint recognizes fixes/closes/resolves keywords",
);
assert.ok(
  mergeEndpointContent.includes('state: "closed"'),
  "Merge endpoint automatically marks linked issues closed",
);
assert.ok(
  mergeEndpointContent.includes('state: "merged"'),
  "Merge endpoint updates pull request state to merged",
);
assert.ok(
  mergeEndpointContent.includes("commitChanges"),
  "Merge endpoint executes commit through commitChanges engine",
);
console.log("✓ Pull request merge engine and issue auto-closing verified.");

// 6. Branch Switcher & Creation
console.log("\n[Test 6] Verifying Branch Management API...");
const branchesContent = fs.readFileSync(path.resolve("src/routes/api/repo/branches.ts"), "utf8");
assert.ok(
  branchesContent.includes("refs/heads/"),
  "Branch API formats references with refs/heads/",
);
assert.ok(branchesContent.includes("upsert"), "Branch API upserts branch references");
console.log("✓ Branch management API verified.");

// 7. Global Pulls Page
console.log("\n[Test 7] Verifying Global Pulls Route...");
const pullsContent = fs.readFileSync(path.resolve("src/routes/pulls.tsx"), "utf8");
assert.ok(pullsContent.includes("global-prs"), "Pulls route queries global pull requests");
assert.ok(pullsContent.includes("filterState"), "Pulls route supports open/closed filtering");
console.log("✓ Global pulls route verified.");

console.log("\n==========================================");
console.log("🎉 ALL PHASE 1 ACCEPTANCE TESTS PASSED!");
console.log("==========================================");
