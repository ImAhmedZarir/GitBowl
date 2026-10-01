import { createFileRoute } from "@tanstack/react-router";

// Git Smart-HTTP endpoint. Also reachable as https://<host>/<owner>/<repo>.git (rewritten in src/server.ts).
const noCache = { "Cache-Control": "no-cache", Pragma: "no-cache" };

const text = (body: string, status = 200, extra: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...noCache, ...extra },
  });

const unauthorized = () =>
  text("Authentication required", 401, { "WWW-Authenticate": 'Basic realm="GitBowl"' });

async function handle(request: Request, splat: string) {
  const m = splat.match(
    /^([^/]+)\/([^/]+?)(?:\.git)?\/(info\/refs|git-upload-pack|git-receive-pack)$/,
  );
  if (!m) return text("Not found", 404);
  const [, owner, name, action] = m as unknown as [string, string, string, string];
  const git = await import("@/lib/git.server");
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");

  const found = await git.findRepo(admin as any, owner, name);
  if (!found) return text("Repository not found", 404);
  const { repo } = found;

  const service =
    action === "info/refs" ? new URL(request.url).searchParams.get("service") : action;
  if (service !== "git-upload-pack" && service !== "git-receive-pack") {
    return text("Please upgrade your git client (smart HTTP required).", 403);
  }

  const needsAuth = service === "git-receive-pack" || repo.is_private;
  let userId: string | null = null;
  if (needsAuth) {
    userId = await git.authenticate(request, admin as any);
    if (!userId) return unauthorized();
    if (userId !== repo.owner_id)
      return text("You don't have write access to this repository", 403);
  }

  if (action === "info/refs") {
    const head = await git.materialize(admin as any, repo, found.owner.username);
    return new Response(
      new Uint8Array(git.advertise(service, head, repo.default_branch || "main")),
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
    },
  },
});
