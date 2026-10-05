// src/routes/api/public/git/$.ts
import { createFileRoute } from "@tanstack/react-router";
import { Buffer } from "node:buffer";

// Git Smart-HTTP & Git LFS v1 endpoint. Also reachable as https://<host>/<owner>/<repo>.git
const noCache = { "Cache-Control": "no-cache", Pragma: "no-cache" };

// Sliding window rate limiter for Git protocol operations
const gitRateLimits = new Map<string, { read: number; write: number; resetAt: number }>();

function checkGitRateLimit(ip: string, isWrite: boolean): boolean {
  const now = Date.now();
  const entry = gitRateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    gitRateLimits.set(ip, {
      read: isWrite ? 0 : 1,
      write: isWrite ? 1 : 0,
      resetAt: now + 60 * 1000,
    });
    return false;
  }
  if (isWrite) {
    entry.write++;
    return entry.write > 60; // max 60 pushes per min
  } else {
    entry.read++;
    return entry.read > 180; // max 180 reads per min
  }
}

const text = (body: string, status = 200, extra: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...noCache, ...extra },
  });

const json = (body: Record<string, unknown>, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/vnd.git-lfs+json", ...noCache, ...extra },
  });

const unauthorized = () =>
  text("Authentication required", 401, { "WWW-Authenticate": 'Basic realm="GitBowl"' });

async function handle(request: Request, splat: string) {
  const m = splat.match(
    /^([^/]+)\/([^/]+?)(?:\.git)?\/(info\/refs|git-upload-pack|git-receive-pack|info\/lfs\/.*)$/,
  );
  if (!m) return text("Not found", 404);
  const [, owner, name, action] = m as unknown as [string, string, string, string];

  const git = await import("@/lib/git.server");
  const lfs = await import("@/lib/git-lfs.server");
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");

  const found = await git.findRepo(admin as any, owner, name);
  if (!found) return text("Repository not found", 404);
  const repo = found.repo as any;

  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";

  /* ------------------------------------------------------------------------ */
  /*                        GIT LFS v1 API HANDLERS                           */
  /* ------------------------------------------------------------------------ */
  if (action.startsWith("info/lfs/")) {
    if (action === "info/lfs/objects/batch") {
      if (request.method !== "POST") return text("Method not allowed", 405);
      const body = await request.json().catch(() => ({}));
      const isUpload = body.operation === "upload";

      if (isUpload || repo.is_private) {
        const userId = await git.authenticate(request, admin as any);
        if (!userId) return unauthorized();
        if (isUpload) {
          const canWrite = await git.hasRepoWriteAccess(admin as any, repo, userId);
          if (!canWrite) return text("You don't have write access to this repository", 403);
        } else if (repo.is_private) {
          const canRead = await git.hasRepoReadAccess(admin as any, repo, userId);
          if (!canRead) return text("Repository not found", 404);
        }
      }

      const res = await lfs.handleLfsBatch(repo.id, owner, name, request.url, body);
      return json(res as any, 200);
    }

    if (action.startsWith("info/lfs/objects/") && request.method === "PUT") {
      const oid = action.replace(/^info\/lfs\/objects\//, "");
      const userId = await git.authenticate(request, admin as any);
      if (!userId) return unauthorized();
      const canWrite = await git.hasRepoWriteAccess(admin as any, repo, userId);
      if (!canWrite) {
        return text("You don't have write access to this repository", 403);
      }

      const rawBuffer = Buffer.from(await request.arrayBuffer());
      const uploadRes = await lfs.handleLfsUpload(repo.id, oid, rawBuffer);
      if (!uploadRes.success) {
        return text(uploadRes.error || "LFS upload failed", 400);
      }
      return json({ success: true }, 200);
    }

    if (action.startsWith("info/lfs/objects/") && request.method === "GET") {
      const oid = action.replace(/^info\/lfs\/objects\//, "");
      if (repo.is_private) {
        const userId = await git.authenticate(request, admin as any);
        if (!userId) return unauthorized();
        const canRead = await git.hasRepoReadAccess(admin as any, repo, userId);
        if (!canRead) return text("Repository not found", 404);
      }

      const buffer = await lfs.handleLfsDownload(oid);
      if (!buffer) return text("LFS object not found", 404);

      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/octet-stream",
          ...noCache,
        },
      });
    }

    if (action === "info/lfs/objects/verify" && request.method === "POST") {
      const userId = await git.authenticate(request, admin as any);
      if (!userId) return unauthorized();

      const body = await request.json().catch(() => ({}));
      const ok = await lfs.handleLfsVerify(repo.id, body.oid, body.size);
      if (!ok) return text("Verification failed", 404);
      return json({ success: true }, 200);
    }

    return text("Not found", 404);
  }

  /* ------------------------------------------------------------------------ */
  /*                      GIT SMART-HTTP API HANDLERS                         */
  /* ------------------------------------------------------------------------ */
  const service =
    action === "info/refs" ? new URL(request.url).searchParams.get("service") : action;
  if (service !== "git-upload-pack" && service !== "git-receive-pack") {
    return text("Please upgrade your git client (smart HTTP required).", 403);
  }

  const isWrite = service === "git-receive-pack";
  if (checkGitRateLimit(clientIp, isWrite)) {
    return text("Rate limit exceeded for git operations. Please retry in 1 minute.", 429);
  }

  const needsAuth = service === "git-receive-pack" || repo.is_private;
  let userId: string | null = null;
  if (needsAuth) {
    userId = await git.authenticate(request, admin as any);
    if (!userId) return unauthorized();
    if (service === "git-receive-pack") {
      const canWrite = await git.hasRepoWriteAccess(admin as any, repo, userId);
      if (!canWrite) return text("You don't have write access to this repository", 403);
    } else if (repo.is_private) {
      const canRead = await git.hasRepoReadAccess(admin as any, repo, userId);
      if (!canRead) return text("Repository not found", 404);
    }
  }

  if (action === "info/refs") {
    const head = await git.materialize(admin as any, repo, found.owner.username);
    const { data: allRefs } = await admin
      .from("refs" as any)
      .select("name, sha")
      .eq("repo_id", repo.id);

    return new Response(
      new Uint8Array(
        git.advertise(service, head, repo.default_branch || "main", (allRefs as any) || []),
      ),
      {
        headers: { "Content-Type": `application/x-${service}-advertisement`, ...noCache },
      },
    );
  }

  if (request.method !== "POST") return text("Method not allowed", 405);

  const out =
    service === "git-upload-pack"
      ? await git.uploadPack(admin as any, repo, request)
      : await git.receivePack(admin as any, repo, userId!, request);

  return new Response(new Uint8Array(out), {
    headers: { "Content-Type": `application/x-${service}-result`, ...noCache },
  });
}

export const Route = createFileRoute("/api/public/git/$")({
  server: {
    handlers: {
      GET: ({ request, params }) => handle(request, (params as { _splat?: string })._splat ?? ""),
      POST: ({ request, params }) => handle(request, (params as { _splat?: string })._splat ?? ""),
      PUT: ({ request, params }) => handle(request, (params as { _splat?: string })._splat ?? ""),
    },
  },
});
