// Real Git Smart-HTTP server (clone / fetch / pull / push) backed by the database.
// Objects live in public.git_objects; repositories.head_sha points at the branch tip.
// Web edits (repo_files) are turned into real commits on the next git access ("materialize").
import { createHash } from "crypto";
import { Buffer } from "buffer";
import * as pako from "pako";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { syncFilesToGoogleDrive } from "@/lib/gdrive.server";

type Admin = ReturnType<typeof createClient<Database>>;
type GitObj = { type: string; body: Buffer };
type Repo = Database["public"]["Tables"]["repositories"]["Row"];

const ZERO = "0".repeat(40);
const TYPE_NUM: Record<string, number> = { commit: 1, tree: 2, blob: 3, tag: 4 };
const NUM_TYPE: Record<number, string> = { 1: "commit", 2: "tree", 3: "blob", 4: "tag" };
const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|mp4|mp3|wav|woff2?|ttf|eot|exe|dll|bin|jar|class|so|dylib)$/i;

/* ---------- helpers ---------- */

export function hashObject(type: string, body: Buffer) {
  return createHash("sha1")
    .update(Buffer.from(`${type} ${body.length}\0`))
    .update(body)
    .digest("hex");
}

function pkt(s: string | Buffer) {
  const b = typeof s === "string" ? Buffer.from(s) : s;
  return Buffer.concat([Buffer.from((b.length + 4).toString(16).padStart(4, "0")), b]);
}
const FLUSH = Buffer.from("0000");

function readPktLines(buf: Buffer, start = 0) {
  const lines: string[] = [];
  let off = start;
  while (off + 4 <= buf.length) {
    const len = parseInt(buf.subarray(off, off + 4).toString(), 16);
    if (Number.isNaN(len)) break;
    if (len === 0) {
      off += 4;
      return { lines, off, flushed: true };
    }
    lines.push(
      buf
        .subarray(off + 4, off + len)
        .toString()
        .replace(/\n$/, ""),
    );
    off += len;
  }
  return { lines, off, flushed: false };
}

async function readBody(request: Request) {
  let buf = Buffer.from(await request.arrayBuffer());
  if (request.headers.get("content-encoding") === "gzip") buf = Buffer.from(pako.ungzip(buf));
  return buf;
}

async function upsertObjects(admin: Admin, repoId: string, objs: Map<string, GitObj>) {
  const rows = [...objs].map(([sha, o]) => ({
    repo_id: repoId,
    sha,
    type: o.type,
    data: o.body.toString("base64"),
  }));
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await admin
      .from("git_objects")
      .upsert(rows.slice(i, i + 100), { onConflict: "repo_id,sha", ignoreDuplicates: true });
    if (error) throw error;
  }
}

async function loadObjects(admin: Admin, repoId: string, shas?: string[]) {
  const out = new Map<string, GitObj>();
  if (shas) {
    for (let i = 0; i < shas.length; i += 200) {
      const { data } = await admin
        .from("git_objects")
        .select("sha, type, data")
        .eq("repo_id", repoId)
        .in("sha", shas.slice(i, i + 200));
      for (const r of data ?? [])
        out.set(r.sha, { type: r.type, body: Buffer.from(r.data, "base64") });
    }
    return out;
  }
  for (let from = 0; ; from += 1000) {
    const { data } = await admin
      .from("git_objects")
      .select("sha, type, data")
      .eq("repo_id", repoId)
      .range(from, from + 999);
    for (const r of data ?? [])
      out.set(r.sha, { type: r.type, body: Buffer.from(r.data, "base64") });
    if (!data || data.length < 1000) break;
  }
  return out;
}

function parseCommit(body: Buffer) {
  const s = body.toString();
  const i = s.indexOf("\n\n");
  const head = s.slice(0, i);
  return {
    tree: head.match(/^tree ([0-9a-f]{40})/m)?.[1] ?? "",
    parents: [...head.matchAll(/^parent ([0-9a-f]{40})/gm)].map((m) => m[1]!),
    message: s.slice(i + 2).trim(),
  };
}

function parseTree(body: Buffer) {
  const out: { mode: string; name: string; sha: string }[] = [];
  let off = 0;
  while (off < body.length) {
    const sp = body.indexOf(0x20, off);
    const nul = body.indexOf(0, sp);
    out.push({
      mode: body.subarray(off, sp).toString(),
      name: body.subarray(sp + 1, nul).toString(),
      sha: body.subarray(nul + 1, nul + 21).toString("hex"),
    });
    off = nul + 21;
  }
  return out;
}

/* ---------- auth & repo lookup ---------- */

export function getAdminAndPublic() {
  const url = process.env["SUPABASE_URL"]!;
  const pub = createClient<Database>(url, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  return pub;
}

export async function authenticate(request: Request, admin: Admin): Promise<string | null> {
  const h = request.headers.get("authorization");
  if (!h?.startsWith("Basic ")) return null;
  const decoded = Buffer.from(h.slice(6), "base64").toString();
  const idx = decoded.indexOf(":");
  let login = decoded.slice(0, idx);
  const password = decoded.slice(idx + 1);
  if (!login || !password) return null;

  // Support Personal Access Tokens (token as password)
  if (password.startsWith("gbp_")) {
    try {
      const hash = createHash("sha256").update(password).digest("hex");
      const { data: pat } = await admin
        .from("personal_access_tokens")
        .select("id, user_id, expires_at")
        .eq("token_hash", hash)
        .maybeSingle();

      if (pat && (!pat.expires_at || new Date(pat.expires_at) > new Date())) {
        // Record last used time asynchronously
        void admin
          .from("personal_access_tokens")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", pat.id);
        return pat.user_id;
      }
    } catch (err) {
      console.warn("PAT verification error:", err);
    }
  }

  if (!login.includes("@")) {
    const { data: p } = await admin
      .from("profiles")
      .select("id")
      .eq("username", login)
      .maybeSingle();
    if (!p) return null;
    const { data: u } = await admin.auth.admin.getUserById(p.id);
    if (!u?.user?.email) return null;
    login = u.user.email;
  }
  const { data, error } = await getAdminAndPublic().auth.signInWithPassword({
    email: login,
    password,
  });
  if (error || !data.user) return null;
  return data.user.id;
}

export async function findRepo(admin: Admin, owner: string, name: string) {
  // 1. Try finding by user profile
  const { data: p } = await admin
    .from("profiles")
    .select("id, username")
    .ilike("username", owner)
    .maybeSingle();

  if (p) {
    const { data: repo } = await admin
      .from("repositories")
      .select("*")
      .eq("owner_id", p.id)
      .eq("name", name)
      .maybeSingle();
    if (repo) return { repo, owner: p };
  }

  // 2. Try finding by organization slug
  const { data: org } = await admin
    .from("orgs" as any)
    .select("id, slug, name")
    .ilike("slug", owner)
    .maybeSingle();

  if (org) {
    const { data: repo } = await admin
      .from("repositories" as any)
      .select("*")
      .eq("org_id", (org as any).id)
      .eq("name", name)
      .maybeSingle();
    if (repo) {
      return {
        repo,
        owner: { id: (org as any).id, username: (org as any).slug },
        org,
      };
    }
  }

  return null;
}

export async function hasRepoWriteAccess(
  admin: Admin,
  repo: any,
  userId: string,
): Promise<boolean> {
  if (repo.owner_id === userId) return true;

  // Direct collaborator check
  const { data: collab } = await admin
    .from("repo_collaborators" as any)
    .select("permission")
    .eq("repo_id", repo.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (collab && ["write", "maintain", "admin"].includes((collab as any).permission)) return true;

  // Organization permission check
  if (repo.org_id) {
    const { data: orgMember } = await admin
      .from("org_members" as any)
      .select("role")
      .eq("org_id", repo.org_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (orgMember && ["owner", "admin"].includes((orgMember as any).role)) return true;

    // Team permission check
    const { data: userTeams } = await admin
      .from("team_members" as any)
      .select("team_id")
      .eq("user_id", userId);

    if (userTeams && userTeams.length > 0) {
      const teamIds = (userTeams as any[]).map((t: any) => t.team_id);
      const { data: teamPerms } = await admin
        .from("team_repo_permissions" as any)
        .select("permission")
        .eq("repo_id", repo.id)
        .in("team_id", teamIds);

      if (
        (teamPerms as any[])?.some((p: any) =>
          ["write", "maintain", "admin"].includes(p.permission),
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

export async function hasRepoReadAccess(
  admin: Admin,
  repo: any,
  userId: string | null,
): Promise<boolean> {
  if (!repo.is_private) return true;
  if (!userId) return false;
  if (repo.owner_id === userId) return true;

  const { data: collab } = await admin
    .from("repo_collaborators" as any)
    .select("permission")
    .eq("repo_id", repo.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (collab) return true;

  if (repo.org_id) {
    const { data: orgMember } = await admin
      .from("org_members" as any)
      .select("role")
      .eq("org_id", repo.org_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (orgMember) return true;

    const { data: userTeams } = await admin
      .from("team_members" as any)
      .select("team_id")
      .eq("user_id", userId);

    if (userTeams && userTeams.length > 0) {
      const teamIds = (userTeams as any[]).map((t: any) => t.team_id);
      const { data: teamPerms } = await admin
        .from("team_repo_permissions" as any)
        .select("permission")
        .eq("repo_id", repo.id)
        .in("team_id", teamIds);

      if (teamPerms && teamPerms.length > 0) return true;
    }
  }

  return false;
}

/* ---------- web files -> commit ---------- */

async function loadFiles(admin: Admin, repoId: string) {
  const files: { path: string; content: string; is_binary: boolean }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await admin
      .from("repo_files")
      .select("path, content, is_binary")
      .eq("repo_id", repoId)
      .range(from, from + 999);
    files.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return files;
}

type Dir = { files: Map<string, string>; dirs: Map<string, Dir> };

function writeTree(dir: Dir, store: Map<string, GitObj>): string {
  const entries: { name: string; mode: string; sha: string; key: string }[] = [];
  for (const [name, sha] of dir.files) entries.push({ name, mode: "100644", sha, key: name });
  for (const [name, sub] of dir.dirs)
    entries.push({ name, mode: "40000", sha: writeTree(sub, store), key: name + "/" });
  entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const body = Buffer.concat(
    entries.map((e) =>
      Buffer.concat([Buffer.from(`${e.mode} ${e.name}\0`), Buffer.from(e.sha, "hex")]),
    ),
  );
  const sha = hashObject("tree", body);
  store.set(sha, { type: "tree", body });
  return sha;
}

/** Ensures head_sha reflects the current web files; creates a commit if they differ. */
export async function materialize(
  admin: Admin,
  repo: Repo,
  ownerName: string,
): Promise<string | null> {
  const files = await loadFiles(admin, repo.id);
  if (!files.length && !repo.head_sha) return null;
  const store = new Map<string, GitObj>();
  const root: Dir = { files: new Map(), dirs: new Map() };
  for (const f of files) {
    const body = f.is_binary ? Buffer.from(f.content, "base64") : Buffer.from(f.content, "utf8");
    const sha = hashObject("blob", body);
    store.set(sha, { type: "blob", body });
    const parts = f.path.split("/").filter(Boolean);
    let d = root;
    for (const part of parts.slice(0, -1)) {
      if (!d.dirs.has(part)) d.dirs.set(part, { files: new Map(), dirs: new Map() });
      d = d.dirs.get(part)!;
    }
    d.files.set(parts[parts.length - 1]!, sha);
  }
  const tree = writeTree(root, store);

  if (repo.head_sha) {
    const head = (await loadObjects(admin, repo.id, [repo.head_sha])).get(repo.head_sha);
    if (head && parseCommit(head.body).tree === tree) return repo.head_sha;
  }

  const { data: last } = await admin
    .from("commits")
    .select("message")
    .eq("repo_id", repo.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ts = Math.floor(Date.now() / 1000);
  const who = `${ownerName} <${ownerName}@users.gitbowl.dev> ${ts} +0000`;
  const parent = repo.head_sha ? `parent ${repo.head_sha}\n` : "";
  const body = Buffer.from(
    `tree ${tree}\n${parent}author ${who}\ncommitter ${who}\n\n${(last?.message ?? "Update").trim()}\n`,
  );
  const sha = hashObject("commit", body);
  store.set(sha, { type: "commit", body });
  await upsertObjects(admin, repo.id, store);
  await admin.from("repositories").update({ head_sha: sha }).eq("id", repo.id);
  return sha;
}

/* ---------- ref advertisement ---------- */

export function advertise(
  service: "git-upload-pack" | "git-receive-pack",
  head: string | null,
  branch: string,
  extraRefs: Array<{ name: string; sha: string }> = [],
) {
  const caps =
    service === "git-upload-pack"
      ? `side-band-64k side-band symref=HEAD:refs/heads/${branch} agent=gitbowl/1.0`
      : `report-status delete-refs ofs-delta side-band-64k agent=gitbowl/1.0`;
  const parts = [pkt(`# service=${service}\n`), FLUSH];
  if (!head) {
    parts.push(pkt(`${ZERO} capabilities^{}\0${caps}\n`));
  } else if (service === "git-upload-pack") {
    parts.push(pkt(`${head} HEAD\0${caps}\n`), pkt(`${head} refs/heads/${branch}\n`));
    for (const r of extraRefs) {
      if (r.name !== `refs/heads/${branch}` && r.name !== "HEAD") {
        parts.push(pkt(`${r.sha} ${r.name}\n`));
      }
    }
  } else {
    parts.push(pkt(`${head} refs/heads/${branch}\0${caps}\n`));
    for (const r of extraRefs) {
      if (r.name !== `refs/heads/${branch}`) {
        parts.push(pkt(`${r.sha} ${r.name}\n`));
      }
    }
  }
  parts.push(FLUSH);
  return Buffer.concat(parts);
}

/* ---------- upload-pack (clone/fetch) ---------- */

function buildPack(objs: Map<string, GitObj>) {
  const chunks: Buffer[] = [];
  const header = Buffer.alloc(12);
  header.write("PACK", 0);
  header.writeUInt32BE(2, 4);
  header.writeUInt32BE(objs.size, 8);
  chunks.push(header);
  for (const o of objs.values()) {
    let size = o.body.length;
    const bytes = [(TYPE_NUM[o.type]! << 4) | (size & 15)];
    size >>= 4;
    while (size > 0) {
      bytes[bytes.length - 1]! |= 0x80;
      bytes.push(size & 0x7f);
      size >>= 7;
    }
    chunks.push(Buffer.from(bytes), Buffer.from(pako.deflate(o.body)));
  }
  const pack = Buffer.concat(chunks);
  return Buffer.concat([pack, createHash("sha1").update(pack).digest()]);
}

export async function uploadPack(admin: Admin, repo: Repo, request: Request) {
  const body = await readBody(request);
  const all: string[] = [];
  let off = 0;
  while (off < body.length) {
    const r = readPktLines(body, off);
    all.push(...r.lines);
    if (r.off === off) break;
    off = r.off;
  }
  if (!all.includes("done")) return Buffer.concat([pkt("NAK\n")]);
  const objs = await loadObjects(admin, repo.id);
  const pack = buildPack(objs);
  const caps =
    all
      .find((l) => l.startsWith("want "))
      ?.split(" ")
      .slice(2) ?? [];
  const band = caps.includes("side-band-64k") ? 65515 : caps.includes("side-band") ? 995 : 0;
  if (!band) return Buffer.concat([pkt("NAK\n"), pack]);
  const out: Buffer[] = [pkt("NAK\n")];
  for (let i = 0; i < pack.length; i += band)
    out.push(pkt(Buffer.concat([Buffer.from([1]), pack.subarray(i, i + band)])));
  out.push(FLUSH);
  return Buffer.concat(out);
}

/* ---------- receive-pack (push) ---------- */

function readVarSize(buf: Buffer, off: number) {
  let result = 0,
    shift = 0,
    b;
  do {
    b = buf[off++]!;
    result |= (b & 0x7f) << shift;
    shift += 7;
  } while (b & 0x80);
  return { value: result, off };
}

function applyDelta(base: Buffer, delta: Buffer) {
  let { off } = readVarSize(delta, 0);
  const dst = readVarSize(delta, off);
  off = dst.off;
  const out = Buffer.alloc(dst.value);
  let o = 0;
  while (off < delta.length) {
    const op = delta[off++]!;
    if (op & 0x80) {
      let cOff = 0,
        cSize = 0;
      for (let i = 0; i < 4; i++) if (op & (1 << i)) cOff |= delta[off++]! << (8 * i);
      for (let i = 0; i < 3; i++) if (op & (0x10 << i)) cSize |= delta[off++]! << (8 * i);
      if (cSize === 0) cSize = 0x10000;
      base.copy(out, o, cOff >>> 0, (cOff >>> 0) + cSize);
      o += cSize;
    } else if (op) {
      delta.copy(out, o, off, off + op);
      o += op;
      off += op;
    }
  }
  return out;
}

type Entry = { offset: number; type: number; data: Buffer; baseOfs?: number; baseRef?: string };

async function parsePack(admin: Admin, repoId: string, buf: Buffer) {
  const result = new Map<string, GitObj>();
  if (buf.length < 12 || buf.subarray(0, 4).toString() !== "PACK") return result;
  const count = buf.readUInt32BE(8);
  let off = 12;
  const entries: Entry[] = [];
  for (let n = 0; n < count; n++) {
    const start = off;
    let b = buf[off++]!;
    const type = (b >> 4) & 7;
    while (b & 0x80) b = buf[off++]!;
    const e: Entry = { offset: start, type, data: Buffer.alloc(0) };
    if (type === 6) {
      let c = buf[off++]!;
      let ofs = c & 0x7f;
      while (c & 0x80) {
        c = buf[off++]!;
        ofs = ((ofs + 1) << 7) | (c & 0x7f);
      }
      e.baseOfs = start - ofs;
    } else if (type === 7) {
      e.baseRef = buf.subarray(off, off + 20).toString("hex");
      off += 20;
    }
    const inf = new pako.Inflate();
    inf.push(buf.subarray(off), true);
    if (inf.err) throw new Error("Corrupt pack data");
    e.data = Buffer.from(inf.result as Uint8Array);
    off += (inf as any).strm.next_in as number;
    entries.push(e);
  }

  const byOffset = new Map<number, GitObj>();
  const external = new Map<string, GitObj>();
  let pending = entries;
  while (pending.length) {
    const next: Entry[] = [];
    for (const e of pending) {
      let obj: GitObj | undefined;
      if (e.type >= 1 && e.type <= 4) obj = { type: NUM_TYPE[e.type]!, body: e.data };
      else {
        const base =
          e.baseOfs !== undefined
            ? byOffset.get(e.baseOfs)
            : (result.get(e.baseRef!) ?? external.get(e.baseRef!));
        if (base) obj = { type: base.type, body: applyDelta(base.body, e.data) };
      }
      if (obj) {
        byOffset.set(e.offset, obj);
        result.set(hashObject(obj.type, obj.body), obj);
      } else next.push(e);
    }
    if (next.length === pending.length) {
      const missing = next
        .filter((e) => e.baseRef && !external.has(e.baseRef))
        .map((e) => e.baseRef!);
      if (!missing.length) throw new Error("Unresolvable delta in pack");
      const found = await loadObjects(admin, repoId, [...new Set(missing)]);
      if (!found.size) throw new Error("Missing delta base objects");
      found.forEach((v, k) => external.set(k, v));
    }
    pending = next;
  }
  return result;
}

export async function receivePack(admin: Admin, repo: Repo, userId: string, request: Request) {
  const body = await readBody(request);
  const { lines, off } = readPktLines(body);
  const cmds = lines.map((l) => {
    const [oldSha, newSha, ref] = l.split("\0")[0]!.split(" ");
    return { oldSha: oldSha!, newSha: newSha!, ref: ref! };
  });
  const sideband = (lines[0]?.split("\0")[1] ?? "").split(" ").includes("side-band-64k");
  const branchRef = `refs/heads/${repo.default_branch || "main"}`;
  const report: Buffer[] = [];
  try {
    const objs = await parsePack(admin, repo.id, body.subarray(off));
    const cache = new Map(objs);
    const get = async (sha: string) => {
      if (!cache.has(sha))
        (await loadObjects(admin, repo.id, [sha])).forEach((v, k) => cache.set(k, v));
      const o = cache.get(sha);
      if (!o) throw new Error(`missing object ${sha}`);
      return o;
    };
    report.push(pkt("unpack ok\n"));

    for (const c of cmds) {
      if (c.newSha === ZERO) {
        if (c.ref === branchRef) {
          report.push(pkt(`ng ${c.ref} deleting the default branch is not allowed\n`));
          continue;
        }
        await admin
          .from("refs" as any)
          .delete()
          .eq("repo_id", repo.id)
          .eq("name", c.ref);
        if (c.ref.startsWith("refs/heads/")) {
          const branchName = c.ref.slice(11);
          await admin
            .from("branches" as any)
            .delete()
            .eq("repo_id", repo.id)
            .eq("name", branchName);
        }
        report.push(pkt(`ok ${c.ref}\n`));
        continue;
      }

      const head = parseCommit((await get(c.newSha)).body);
      const files: { path: string; content: string; is_binary: boolean; size: number }[] = [];
      const walk = async (treeSha: string, prefix: string) => {
        for (const e of parseTree((await get(treeSha)).body)) {
          const p = prefix + e.name;
          if (e.mode === "40000") await walk(e.sha, p + "/");
          else if (e.mode === "160000") continue;
          else {
            const bytes = (await get(e.sha)).body;
            const text = bytes.toString("utf8");
            const binary =
              BINARY_EXT.test(p) || bytes.includes(0) || !Buffer.from(text, "utf8").equals(bytes);
            files.push({
              path: p,
              content: binary ? bytes.toString("base64") : text,
              is_binary: binary,
              size: bytes.length,
            });
          }
        }
      };
      await walk(head.tree, "");

      // New commit messages, newest first, until the previous tip.
      const msgs: string[] = [];
      let cur: string | undefined = c.newSha;
      while (cur && cur !== c.oldSha && objs.has(cur) && msgs.length < 200) {
        const pc = parseCommit(objs.get(cur)!.body);
        msgs.push(pc.message.split("\n")[0] || "Push");
        cur = pc.parents[0];
      }

      await upsertObjects(admin, repo.id, objs);

      // Record ref update in refs and branches tables
      await admin.from("refs" as any).upsert(
        {
          repo_id: repo.id,
          name: c.ref,
          sha: c.newSha,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "repo_id,name" },
      );

      if (c.ref.startsWith("refs/heads/")) {
        const branchName = c.ref.slice(11);
        await admin.from("branches" as any).upsert(
          {
            repo_id: repo.id,
            name: branchName,
            commit_sha: c.newSha,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "repo_id,name" },
        );
      }

      if (c.ref === branchRef) {
        const old = await loadFiles(admin, repo.id);
        const oldMap = new Map(old.map((f) => [f.path, f.content]));
        const changes = [
          ...files
            .filter((f) => oldMap.get(f.path) !== f.content)
            .map((f) => ({ path: f.path, type: oldMap.has(f.path) ? "modified" : "added" })),
          ...old
            .filter((f) => !files.some((n) => n.path === f.path))
            .map((f) => ({ path: f.path, type: "deleted" })),
        ];
        // Incremental updates: only upsert changed/added files, and delete removed files
        const toUpsert = files.filter((f) => oldMap.get(f.path) !== f.content);
        const toDelete = old
          .filter((f) => !files.some((n) => n.path === f.path))
          .map((f) => f.path);

        if (toUpsert.length) {
          for (let i = 0; i < toUpsert.length; i += 100) {
            const { error } = await admin.from("repo_files").upsert(
              toUpsert.slice(i, i + 100).map((f) => ({ ...f, repo_id: repo.id })),
              { onConflict: "repo_id,path" },
            );
            if (error) throw error;
          }

          // Mirror committed files to central storage tier
          try {
            const { data: ownerProfile } = await admin
              .from("profiles")
              .select("username")
              .eq("id", repo.owner_id)
              .single();
            const ownerUser = ownerProfile?.username || "developer";
            syncFilesToGoogleDrive(ownerUser, repo.name, toUpsert).catch((err) =>
              console.warn("[GDrive] Git push sync error:", err),
            );
          } catch (e) {
            console.warn("[GDrive] Lookup profile for Drive sync error:", e);
          }
        }

        if (toDelete.length) {
          for (let i = 0; i < toDelete.length; i += 100) {
            const { error } = await admin
              .from("repo_files")
              .delete()
              .eq("repo_id", repo.id)
              .in("path", toDelete.slice(i, i + 100));
            if (error) throw error;
          }
        }

        const now = Date.now();
        const rows = msgs.reverse().map((m, i, arr) => ({
          repo_id: repo.id,
          author_id: userId,
          message: m,
          changes: i === arr.length - 1 ? changes : [],
          created_at: new Date(now - (arr.length - 1 - i) * 1000).toISOString(),
        }));
        if (rows.length) await admin.from("commits").insert(rows);
        await admin
          .from("repositories")
          .update({ head_sha: c.newSha, updated_at: new Date().toISOString() })
          .eq("id", repo.id);
      } else {
        const now = Date.now();
        const rows = msgs.reverse().map((m, i) => ({
          repo_id: repo.id,
          author_id: userId,
          message: m,
          changes: [],
          created_at: new Date(now - (msgs.length - 1 - i) * 1000).toISOString(),
        }));
        if (rows.length) await admin.from("commits").insert(rows);
      }

      // Dispatch Webhook on push
      try {
        const { dispatchRepoWebhooks } = await import("@/lib/webhooks.server");
        void dispatchRepoWebhooks({
          repoId: repo.id,
          event: "push",
          payload: {
            ref: c.ref,
            before: c.oldSha,
            after: c.newSha,
            repository: { id: repo.id, name: repo.name },
            pusher: { id: userId },
            commits: msgs.map((m) => ({ id: c.newSha, message: m })),
          },
        });
      } catch (webhookErr) {
        console.warn("[Git] Webhook dispatch error:", webhookErr);
      }

      report.push(pkt(`ok ${c.ref}\n`));
    }
  } catch (e: any) {
    report.length = 0;
    report.push(pkt(`unpack ${String(e?.message ?? e).replace(/\n/g, " ")}\n`));
    for (const c of cmds) report.push(pkt(`ng ${c.ref} unpacker error\n`));
  }
  report.push(FLUSH);
  const result = Buffer.concat(report);
  if (!sideband) return result;
  return Buffer.concat([pkt(Buffer.concat([Buffer.from([1]), result])), FLUSH]);
}
