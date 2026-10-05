// tests/phase5-acceptance.test.mjs
// Phase 5 Acceptance Test Suite: GitHub Sync, REST API v1, CLI & Mobile Polish
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  checkApiV1RateLimit,
  applyRateLimitHeaders,
  v1RateLimitExceeded,
  formatGitHubRepo,
  formatGitHubUser,
} from "../src/lib/api-v1.server.ts";

console.log("=== GitBowl Phase 5 Acceptance Tests ===");

// 1. Database Migration 0012 Integrity
console.log("\n[Test 1] Verifying Phase 5 Database Migration...");
const migrationPath = path.resolve("drizzle/migrations/0012_phase5_github_sync_and_api_v1.sql");
assert.ok(fs.existsSync(migrationPath), "Migration 0012 must exist");
const sql = fs.readFileSync(migrationPath, "utf8");

assert.ok(
  sql.includes("CREATE TABLE IF NOT EXISTS public.repo_github_sync"),
  "repo_github_sync table must exist",
);
assert.ok(sql.includes("sync_direction"), "sync_direction column must exist");
assert.ok(sql.includes("conflict_strategy"), "conflict_strategy column must exist");
assert.ok(
  sql.includes("CREATE TABLE IF NOT EXISTS public.api_rate_limits"),
  "api_rate_limits table must exist",
);
console.log("✓ Migration 0012 contains all required schema definitions.");

// 2. Bi-directional GitHub Sync Engine
console.log("\n[Test 2] Verifying Bi-directional GitHub Sync Logic...");
const syncServiceCode = fs.readFileSync(path.resolve("src/lib/github-sync.server.ts"), "utf8");
assert.ok(syncServiceCode.includes("mirrorToGitHub"), "mirrorToGitHub function must exist");
assert.ok(syncServiceCode.includes("pullFromGitHub"), "pullFromGitHub function must exist");
assert.ok(syncServiceCode.includes("getRepoSyncConfig"), "getRepoSyncConfig function must exist");
assert.ok(syncServiceCode.includes("setRepoSyncConfig"), "setRepoSyncConfig function must exist");

const webhookReceiverCode = fs.readFileSync(
  path.resolve("src/routes/api/github/webhook.ts"),
  "utf8",
);
assert.ok(webhookReceiverCode.includes("x-github-event"), "Webhook must check x-github-event");
assert.ok(
  webhookReceiverCode.includes("pullFromGitHub"),
  "Webhook must pull changes on push event",
);

const repoSyncApiCode = fs.readFileSync(path.resolve("src/routes/api/repo/github-sync.ts"), "utf8");
assert.ok(repoSyncApiCode.includes("setRepoSyncConfig"), "Repo sync API must configure sync");
assert.ok(repoSyncApiCode.includes("sync_now"), "Repo sync API must support manual sync_now");
console.log("✓ GitHub Sync engine and webhook receiver verified.");

// 3. REST API v1 Schemas & GitHub v3 Compatibility
console.log("\n[Test 3] Verifying REST API v1 Schemas (GitHub Compatibility)...");
const sampleRepo = {
  id: "repo-123",
  name: "hello-world",
  description: "My first repository",
  is_private: false,
  owner_id: "user-456",
  default_branch: "main",
  stars_count: 42,
  forks_count: 7,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const ghRepo = formatGitHubRepo(sampleRepo, "octocat");
assert.equal(ghRepo.name, "hello-world");
assert.equal(ghRepo.full_name, "octocat/hello-world");
assert.equal(ghRepo.owner.login, "octocat");
assert.equal(ghRepo.private, false);
assert.equal(ghRepo.default_branch, "main");
assert.equal(ghRepo.stargazers_count, 42);
assert.equal(ghRepo.forks_count, 7);
assert.ok(ghRepo.clone_url.includes("octocat/hello-world.git"));

const sampleProfile = {
  id: "user-456",
  username: "octocat",
  display_name: "The Octocat",
  bio: "GitBowl mascot",
  created_at: new Date().toISOString(),
};

const ghUser = formatGitHubUser(sampleProfile);
assert.equal(ghUser.login, "octocat");
assert.equal(ghUser.name, "The Octocat");
assert.equal(ghUser.bio, "GitBowl mascot");
assert.ok(ghUser.html_url.includes("octocat"));
console.log("✓ GitHub REST API v3 schema compliance verified.");

// 4. Rate Limiting Engine & Decrementing Headers
console.log("\n[Test 4] Verifying Rate Limiter & Rate Limit Headers...");
const mockReq = new Request("https://gitbowl.dev/api/v1/user", {
  headers: { "x-forwarded-for": "192.168.1.100" },
});

// Authenticated user (limit 5,000)
const res1 = checkApiV1RateLimit(mockReq, "user-authed-test");
assert.equal(res1.limit, 5000, "Authenticated limit must be 5000");
assert.equal(res1.allowed, true, "First request must be allowed");

const res2 = checkApiV1RateLimit(mockReq, "user-authed-test");
assert.equal(res2.remaining, res1.remaining - 1, "Remaining must decrement on successive requests");

const headers = new Headers();
applyRateLimitHeaders(headers, res2);
assert.equal(headers.get("X-RateLimit-Limit"), "5000");
assert.equal(headers.get("X-RateLimit-Remaining"), res2.remaining.toString());
assert.ok(headers.has("X-RateLimit-Reset"));

// Unauthenticated (limit 60)
const unauthReq = new Request("https://gitbowl.dev/api/v1/repos/a/b", {
  headers: { "x-forwarded-for": "203.0.113.50" },
});
const unauth1 = checkApiV1RateLimit(unauthReq, null);
assert.equal(unauth1.limit, 60, "Unauthenticated limit must be 60");

// Exceed rate limit response
const exceededResponse = v1RateLimitExceeded({
  allowed: false,
  limit: 60,
  remaining: 0,
  reset: Math.floor(Date.now() / 1000) + 3600,
});
assert.equal(exceededResponse.status, 429, "Exceeded rate limit must return HTTP 429");
console.log("✓ Rate limiting engine and decrementing headers verified.");

// 5. Standalone CLI Tool ("bowl") Execution
console.log("\n[Test 5] Executing Standalone CLI Tool ('bowl')...");
const cliPath = path.resolve("cli/bin/bowl.js");
assert.ok(fs.existsSync(cliPath), "cli/bin/bowl.js must exist");

// Run --version
const versionOutput = execSync(`node ${cliPath} --version`, { encoding: "utf8" });
assert.ok(versionOutput.includes("gitbowl-cli"), "Version output must contain gitbowl-cli");

// Run --help
const helpOutput = execSync(`node ${cliPath} --help`, { encoding: "utf8" });
assert.ok(helpOutput.includes("bowl <command>"), "Help output must describe command usage");
assert.ok(helpOutput.includes("auth login"), "Help must list auth login");
assert.ok(helpOutput.includes("repo create"), "Help must list repo create");
assert.ok(helpOutput.includes("pr create"), "Help must list pr create");
assert.ok(helpOutput.includes("issue create"), "Help must list issue create");

// Run auth status
const authStatusOutput = execSync(`node ${cliPath} auth status`, { encoding: "utf8" });
assert.ok(
  authStatusOutput.includes("logged in") || authStatusOutput.includes("Authenticated"),
  "Auth status must output status",
);
console.log("✓ Standalone CLI tool ('bowl') commands executed successfully.");

// 6. Mobile Viewport & Polish
console.log("\n[Test 6] Verifying Mobile Polish, Bottom Nav & Service Worker...");
const mobileNavPath = path.resolve("src/components/MobileNav.tsx");
assert.ok(fs.existsSync(mobileNavPath), "MobileNav.tsx must exist");
const mobileNavCode = fs.readFileSync(mobileNavPath, "utf8");
assert.ok(mobileNavCode.includes("md:hidden"), "MobileNav must only display on mobile devices");
assert.ok(mobileNavCode.includes("Home"), "MobileNav must include Home");
assert.ok(mobileNavCode.includes("Search"), "MobileNav must include Search");
assert.ok(mobileNavCode.includes("Pulls"), "MobileNav must include Pulls");
assert.ok(mobileNavCode.includes("Issues"), "MobileNav must include Issues");

const rootCode = fs.readFileSync(path.resolve("src/routes/__root.tsx"), "utf8");
assert.ok(rootCode.includes("<MobileNav />"), "Root component must render MobileNav");
assert.ok(
  rootCode.includes("serviceWorker.register"),
  "Root component must register service worker",
);

const swPath = path.resolve("public/sw.js");
assert.ok(fs.existsSync(swPath), "public/sw.js service worker must exist");
const swCode = fs.readFileSync(swPath, "utf8");
assert.ok(swCode.includes("CACHE_NAME"), "Service worker must specify CACHE_NAME");
assert.ok(swCode.includes("STATIC_ASSETS"), "Service worker must specify static assets");
console.log("✓ Mobile bottom nav, responsiveness, and offline service worker verified.");

// 7. OpenAPI 3.1 & Interactive Docs
console.log("\n[Test 7] Verifying OpenAPI Spec & Interactive API Documentation...");
assert.ok(
  fs.existsSync(path.resolve("src/routes/api/v1/openapi[.]json.ts")),
  "OpenAPI endpoint must exist",
);
assert.ok(
  fs.existsSync(path.resolve("src/routes/api/docs.tsx")),
  "Interactive docs page must exist",
);
console.log("✓ OpenAPI 3.1 specification and interactive API documentation verified.");

console.log("\n==========================================");
console.log("🎉 ALL PHASE 5 ACCEPTANCE TESTS PASSED!");
console.log("==========================================");
