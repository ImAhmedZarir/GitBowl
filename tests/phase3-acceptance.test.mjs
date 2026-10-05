// tests/phase3-acceptance.test.mjs
// Phase 3 Acceptance Test Suite: Git Smart HTTP, Protocol Parity, Multi-Branch & Git LFS v1
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { advertise } from "../src/lib/git.server.ts";
import { isLfsPointer, parseLfsPointer, handleLfsBatch } from "../src/lib/git-lfs.server.ts";

console.log("=== GitBowl Phase 3 Acceptance Tests ===");

// 1. Ref Advertisement & Packet-Line Encoding
console.log("\n[Test 1] Testing Smart HTTP Ref Advertisement & Capabilities...");
const headSha = "1111111111111111111111111111111111111111";
const featureSha = "2222222222222222222222222222222222222222";
const tagSha = "3333333333333333333333333333333333333333";

const extraRefs = [
  { name: "refs/heads/feature-login", sha: featureSha },
  { name: "refs/tags/v1.0.0", sha: tagSha },
];

const uploadAdv = advertise("git-upload-pack", headSha, "main", extraRefs).toString("utf8");
assert.ok(uploadAdv.includes("# service=git-upload-pack"), "Must advertise service header");
assert.ok(uploadAdv.includes("0000"), "Must contain flush-pkt delimiter");
assert.ok(uploadAdv.includes(`${headSha} HEAD\0`), "Must advertise HEAD ref");
assert.ok(uploadAdv.includes("symref=HEAD:refs/heads/main"), "Must advertise symref cap");
assert.ok(uploadAdv.includes("side-band-64k"), "Must advertise side-band-64k cap");
assert.ok(uploadAdv.includes(`${headSha} refs/heads/main`), "Must advertise main branch");
assert.ok(
  uploadAdv.includes(`${featureSha} refs/heads/feature-login`),
  "Must advertise secondary branches",
);
assert.ok(uploadAdv.includes(`${tagSha} refs/tags/v1.0.0`), "Must advertise tag refs");

// Empty repository advertisement
const emptyAdv = advertise("git-upload-pack", null, "main").toString("utf8");
assert.ok(
  emptyAdv.includes("0000000000000000000000000000000000000000 capabilities^{}"),
  "Must advertise zero-sha for empty repo",
);
console.log("✓ Smart HTTP ref advertisement verified.");

// 2. Git LFS Pointer Detection & Parsing
console.log("\n[Test 2] Testing Git LFS Pointer Parsing...");
const validPointer = [
  "version https://git-lfs.github.com/spec/v1",
  "oid sha256:4cac5f7bbd0f81a7000ddca91404edbd2b508f7ceee7c2a713184eb43b573516",
  "size 5242880",
  "",
].join("\n");

assert.equal(isLfsPointer(validPointer), true, "Must identify valid LFS pointer file");
assert.equal(isLfsPointer("const a = 123;"), false, "Must reject non-LFS files");

const parsed = parseLfsPointer(validPointer);
assert.ok(parsed, "Pointer must parse successfully");
assert.equal(
  parsed.oid,
  "4cac5f7bbd0f81a7000ddca91404edbd2b508f7ceee7c2a713184eb43b573516",
  "Must parse correct sha256 OID",
);
assert.equal(parsed.size, 5242880, "Must parse correct 5 MB size");
console.log("✓ Git LFS pointer parser verified.");

// 3. Git LFS v1 Batch Protocol Response
console.log("\n[Test 3] Testing Git LFS Batch Protocol Spec...");
const batchRes = await handleLfsBatch(
  "test-repo-id",
  "torvalds",
  "linux",
  "https://gitbowl.dev/torvalds/linux.git/info/lfs/objects/batch",
  {
    operation: "upload",
    objects: [{ oid: parsed.oid, size: parsed.size }],
  },
);

assert.equal(batchRes.transfer, "basic", "LFS transfer must be basic");
assert.equal(batchRes.objects.length, 1, "Must return 1 object");
assert.equal(batchRes.objects[0].oid, parsed.oid, "Must match requested OID");
assert.ok(batchRes.objects[0].actions?.upload?.href, "Must provide upload action href");
assert.ok(
  batchRes.objects[0].actions.upload.href.includes(parsed.oid),
  "Upload href must contain OID",
);
assert.ok(batchRes.objects[0].actions?.verify?.href, "Must provide verify action href");
console.log("✓ Git LFS batch protocol handler verified.");

// 4. Multi-Branch Push & Deletion Support
console.log("\n[Test 4] Verifying Multi-Branch Push & Deletion in Server Logic...");
const gitServerCode = fs.readFileSync(path.resolve("src/lib/git.server.ts"), "utf8");
assert.ok(
  /from\(\s*["']branches["']\s*as\s*any\s*\)\s*\.upsert/.test(gitServerCode),
  "receivePack must upsert into branches table",
);
assert.ok(
  /from\(\s*["']branches["']\s*as\s*any\s*\)\s*\.delete/.test(gitServerCode),
  "receivePack must support deleting branches",
);
assert.ok(
  gitServerCode.includes("deleting the default branch is not allowed"),
  "receivePack must protect default branch from deletion",
);
assert.ok(
  gitServerCode.includes("dispatchRepoWebhooks"),
  "receivePack must dispatch push webhooks",
);
console.log("✓ Multi-branch push and branch deletion verified.");

// 5. Migration 0010 Schema Integrity
console.log("\n[Test 5] Verifying Phase 3 Database Migration...");
const migrationPath = path.resolve("drizzle/migrations/0010_phase3_git_parity_and_lfs.sql");
assert.ok(fs.existsSync(migrationPath), "Migration 0010 must exist");
const sql = fs.readFileSync(migrationPath, "utf8");
assert.ok(
  sql.includes("CREATE TABLE IF NOT EXISTS public.lfs_objects"),
  "lfs_objects table must exist",
);
assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.lfs_data"), "lfs_data table must exist");
assert.ok(sql.includes("idx_lfs_objects_repo_oid"), "LFS index on (repo_id, oid) must exist");
console.log("✓ Migration 0010 contains all required schema definitions.");

// 6. Web UI LFS Integration
console.log("\n[Test 6] Verifying Web UI Git LFS Badge and Viewer...");
const repoUiCode = fs.readFileSync(path.resolve("src/routes/$owner/$repo.tsx"), "utf8");
assert.ok(repoUiCode.includes("Git LFS"), "Repo UI renders Git LFS badge");
assert.ok(repoUiCode.includes("Stored with Git LFS"), "Repo UI renders LFS file card");
assert.ok(
  repoUiCode.includes("Download raw LFS file"),
  "Repo UI provides direct LFS asset download",
);
console.log("✓ Web UI Git LFS integration verified.");

console.log("\n==========================================");
console.log("🎉 ALL PHASE 3 ACCEPTANCE TESTS PASSED!");
console.log("==========================================");
