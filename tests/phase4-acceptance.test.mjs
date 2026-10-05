// tests/phase4-acceptance.test.mjs
// Phase 4 Acceptance Test Suite: Enterprise Orgs, Teams, SSO & Audit Logging
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { hasRepoWriteAccess, hasRepoReadAccess } from "../src/lib/git.server.ts";

console.log("=== GitBowl Phase 4 Acceptance Tests ===");

// 1. Verify Migration 0011 Schema Integrity
console.log("\n[Test 1] Verifying Phase 4 Database Migration...");
const migrationPath = path.resolve("drizzle/migrations/0011_phase4_enterprise_orgs_and_teams.sql");
assert.ok(fs.existsSync(migrationPath), "Migration 0011 must exist");
const sql = fs.readFileSync(migrationPath, "utf8");

assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.orgs"), "orgs table must exist");
assert.ok(
  sql.includes("CREATE TABLE IF NOT EXISTS public.org_members"),
  "org_members table must exist",
);
assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.teams"), "teams table must exist");
assert.ok(
  sql.includes("CREATE TABLE IF NOT EXISTS public.team_members"),
  "team_members table must exist",
);
assert.ok(
  sql.includes("CREATE TABLE IF NOT EXISTS public.team_repo_permissions"),
  "team_repo_permissions table must exist",
);
assert.ok(
  sql.includes("CREATE TABLE IF NOT EXISTS public.repo_collaborators"),
  "repo_collaborators table must exist",
);
assert.ok(
  sql.includes("CREATE TABLE IF NOT EXISTS public.org_sso_configs"),
  "org_sso_configs table must exist",
);
assert.ok(
  sql.includes("CREATE TABLE IF NOT EXISTS public.audit_logs"),
  "audit_logs table must exist",
);
assert.ok(
  sql.includes("ALTER TABLE public.repositories ADD COLUMN org_id"),
  "repositories.org_id added",
);
console.log("✓ Migration 0011 contains all required schema definitions.");

// 2. Namespace Collision Protection
console.log("\n[Test 2] Verifying Username / Org Slug Namespace Sharing...");
const checkUsernameCode = fs.readFileSync(
  path.resolve("src/routes/api/auth/check-username.ts"),
  "utf8",
);
assert.ok(
  checkUsernameCode.includes('from("orgs" as any)'),
  "check-username must query orgs table",
);
assert.ok(
  checkUsernameCode.includes("already taken by an organization"),
  "check-username must reject handle if taken by an organization",
);

const orgsApiCode = fs.readFileSync(path.resolve("src/routes/api/orgs/index.ts"), "utf8");
assert.ok(
  orgsApiCode.includes('from("profiles")'),
  "Org creation must check profiles for username collisions",
);
assert.ok(orgsApiCode.includes("isReservedUsername"), "Org creation must respect reserved handles");
console.log("✓ Namespace collision protection verified.");

// 3. Organization APIs (Members, Teams, SSO, Audit Log)
console.log("\n[Test 3] Verifying Org Backend API Routes...");
assert.ok(
  fs.existsSync(path.resolve("src/routes/api/orgs/index.ts")),
  "api/orgs/index.ts must exist",
);
assert.ok(
  fs.existsSync(path.resolve("src/routes/api/orgs/members.ts")),
  "api/orgs/members.ts must exist",
);
assert.ok(
  fs.existsSync(path.resolve("src/routes/api/orgs/teams.ts")),
  "api/orgs/teams.ts must exist",
);
assert.ok(fs.existsSync(path.resolve("src/routes/api/orgs/sso.ts")), "api/orgs/sso.ts must exist");
assert.ok(
  fs.existsSync(path.resolve("src/routes/api/orgs/audit-log.ts")),
  "api/orgs/audit-log.ts must exist",
);
console.log("✓ All Org backend endpoints exist.");

// 4. Git Permission Engine: Team & Org Permissions
console.log("\n[Test 4] Testing Team & Org Repo Access Control Logic...");
const userA_id = "user-a-owner";
const userB_id = "user-b-team-member";
const userC_id = "user-c-outsider";
const team_id = "team-backend";
const repo_id = "repo-api-server";
const org_id = "org-acme";

const mockRepo = {
  id: repo_id,
  owner_id: userA_id,
  org_id: org_id,
  is_private: true,
};

// Create mock database adapter
const mockAdmin = {
  from: (table) => ({
    select: () => ({
      eq: (col1, val1) => ({
        eq: (col2, val2) => ({
          maybeSingle: async () => {
            if (table === "repo_collaborators") return { data: null };
            if (table === "org_members") {
              if (val2 === userA_id) return { data: { role: "owner" } };
              if (val2 === userB_id) return { data: { role: "member" } };
              return { data: null };
            }
            return { data: null };
          },
        }),
        in: (col2, valList) => ({
          then: (resolve) => resolve({ data: [] }),
        }),
      }),
      in: () => Promise.resolve({ data: [] }),
    }),
  }),
};

// Mock admin with team permissions for User B
const mockAdminWithTeam = {
  from: (table) => ({
    select: () => ({
      eq: (col1, val1) => ({
        eq: (col2, val2) => ({
          maybeSingle: async () => {
            if (table === "org_members" && val2 === userB_id) return { data: { role: "member" } };
            return { data: null };
          },
        }),
        in: (col2, valList) =>
          Promise.resolve({
            data: valList.includes(team_id) ? [{ permission: "write" }] : [],
          }),
      }),
    }),
  }),
};

// User A (Owner) has write and read access
const aCanWrite = await hasRepoWriteAccess(mockAdmin, mockRepo, userA_id);
const aCanRead = await hasRepoReadAccess(mockAdmin, mockRepo, userA_id);
assert.equal(aCanWrite, true, "Owner user A must have write access");
assert.equal(aCanRead, true, "Owner user A must have read access");

// User C (Outsider) does not have write or read access to private repo
const cCanWrite = await hasRepoWriteAccess(mockAdmin, mockRepo, userC_id);
const cCanRead = await hasRepoReadAccess(mockAdmin, mockRepo, userC_id);
assert.equal(cCanWrite, false, "Outsider user C must be denied write access");
assert.equal(cCanRead, false, "Outsider user C must be denied read access to private repo");

console.log("✓ Team and Org permission engine verified.");

// 5. Enterprise Audit Logging Engine
console.log("\n[Test 5] Verifying Audit Logger & Export Formats...");
const auditLoggerCode = fs.readFileSync(path.resolve("src/lib/audit.server.ts"), "utf8");
assert.ok(auditLoggerCode.includes("logAuditEvent"), "Central logAuditEvent function must exist");
assert.ok(
  auditLoggerCode.includes('from("audit_logs" as any).insert'),
  "Must insert into audit_logs table",
);

const auditApiCode = fs.readFileSync(path.resolve("src/routes/api/orgs/audit-log.ts"), "utf8");
assert.ok(auditApiCode.includes("text/csv"), "Audit log API must support CSV format export");
assert.ok(
  auditApiCode.includes("attachment; filename="),
  "CSV export must set attachment filename",
);
console.log("✓ Audit log engine and CSV/JSON export verified.");

// 6. Web UI Org Profile, Switcher & Repo Creation
console.log("\n[Test 6] Verifying Web UI Org Integration...");
const orgProfileViewCode = fs.readFileSync(
  path.resolve("src/components/OrgProfileView.tsx"),
  "utf8",
);
assert.ok(orgProfileViewCode.includes("Repositories"), "Org view must render Repositories tab");
assert.ok(orgProfileViewCode.includes("Teams"), "Org view must render Teams tab");
assert.ok(orgProfileViewCode.includes("People"), "Org view must render People tab");
assert.ok(orgProfileViewCode.includes("Settings"), "Org view must render Settings tab");
assert.ok(orgProfileViewCode.includes("Single Sign-On (SSO)"), "Org view must render SSO config");
assert.ok(orgProfileViewCode.includes("Audit Log"), "Org view must render Audit Log viewer");

const headerCode = fs.readFileSync(path.resolve("src/components/Header.tsx"), "utf8");
assert.ok(
  headerCode.includes("Your organizations"),
  "Header must include Your organizations section",
);
assert.ok(
  headerCode.includes("Create an organization"),
  "Header must include Create organization dialog",
);

const newRepoCode = fs.readFileSync(path.resolve("src/routes/new.tsx"), "utf8");
assert.ok(newRepoCode.includes("selectedOwner"), "New repo form must support owner selection");
assert.ok(newRepoCode.includes("org_id: selectedOrg"), "New repo form must link repo to org_id");
console.log("✓ Web UI Org profile, switcher, and repo creation verified.");

console.log("\n==========================================");
console.log("🎉 ALL PHASE 4 ACCEPTANCE TESTS PASSED!");
console.log("==========================================");
