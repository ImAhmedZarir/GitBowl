import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// Map `https://host/<owner>/<repo>.git/...` (and `/<owner>/<repo>/info/...`) onto the git endpoint so plain git operations work.
function rewriteGitUrl(request: Request): Request | Response {
  const url = new URL(request.url);

  // Case 1: URL with .git
  const gitMatch = url.pathname.match(/^\/([^/]+)\/([^/]+)\.git(\/.*)?$/);
  if (gitMatch) {
    if (!gitMatch[3] || gitMatch[3] === "/")
      return Response.redirect(`${url.origin}/${gitMatch[1]}/${gitMatch[2]}`, 302);
    url.pathname = `/api/public/git/${gitMatch[1]}/${gitMatch[2]}.git${gitMatch[3]}`;
    return new Request(url.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      // @ts-expect-error duplex is required for streaming bodies in Node
      duplex: "half",
    });
  }

  // Case 2: URL without .git for Smart HTTP and Git LFS paths
  const plainMatch = url.pathname.match(
    /^\/([^/]+)\/([^/]+)\/(info\/refs|git-upload-pack|git-receive-pack|info\/lfs\/.*)$/,
  );
  if (plainMatch) {
    url.pathname = `/api/public/git/${plainMatch[1]}/${plainMatch[2]}/${plainMatch[3]}`;
    return new Request(url.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      // @ts-expect-error duplex is required for streaming bodies in Node
      duplex: "half",
    });
  }

  return request;
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const rewritten = rewriteGitUrl(request);
      if (rewritten instanceof Response) return rewritten;
      request = rewritten;
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
