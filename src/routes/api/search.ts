// src/routes/api/search.ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { createHash } from "crypto";

// Basic rate limiting for search
const searchRateLimits = new Map<string, { count: number; resetAt: number }>();
function checkSearchRateLimit(ipOrKey: string): boolean {
  const now = Date.now();
  const entry = searchRateLimits.get(ipOrKey);
  if (!entry || entry.resetAt < now) {
    searchRateLimits.set(ipOrKey, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= 60) return false;
  entry.count++;
  return true;
}

export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const clientIp =
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
          if (!checkSearchRateLimit(clientIp)) {
            return new Response(JSON.stringify({ error: "Search rate limit exceeded" }), {
              status: 429,
              headers: { "Content-Type": "application/json", "Retry-After": "60" },
            });
          }

          const url = new URL(request.url);
          let q = (url.searchParams.get("q") || "").trim().slice(0, 100);
          let type = (url.searchParams.get("type") || "repositories").toLowerCase();

          // Extract inline type: filter if user typed e.g. "auth type:code"
          const typeMatch = q.match(/type:(code|repositories|repo|issues|issue|users|user)/i);
          if (typeMatch) {
            const matchedType = typeMatch[1]?.toLowerCase();
            if (matchedType === "repo") type = "repositories";
            else if (matchedType === "issue") type = "issues";
            else if (matchedType === "user") type = "users";
            else if (matchedType) type = matchedType;
            q = q.replace(typeMatch[0], "").trim();
          }

          if (!q) {
            return new Response(JSON.stringify({ results: [], count: 0, query: q, type }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          const supabase = getSupabaseAdmin();

          // 1. Authenticate viewer if token is provided
          let viewerId: string | null = null;
          const authHeader = request.headers.get("authorization");
          if (authHeader?.toLowerCase().startsWith("bearer ")) {
            const token = authHeader.slice(7).trim();
            if (token.startsWith("gbp_")) {
              const hash = createHash("sha256").update(token).digest("hex");
              const { data: pat } = await supabase
                .from("personal_access_tokens")
                .select("user_id, expires_at")
                .eq("token_hash", hash)
                .maybeSingle();
              if (pat && (!pat.expires_at || new Date(pat.expires_at) > new Date())) {
                viewerId = pat.user_id;
              }
            } else {
              const { data: userData } = await supabase.auth.getUser(token);
              if (userData?.user) {
                viewerId = userData.user.id;
              }
            }
          }

          // Safe sanitized search string
          const cleanQ = q.replace(/[%_\\]/g, "\\$&");

          if (type === "code") {
            // Attempt parameterized RPC first
            let codeResults: any[] = [];
            const { data: rpcFiles, error: rpcError } = await (supabase.rpc as any)(
              "search_code_safe",
              {
                search_query: cleanQ,
                viewer_id: viewerId,
                max_results: 30,
              },
            );

            if (!rpcError && Array.isArray(rpcFiles)) {
              codeResults = rpcFiles.map((f: any) => {
                let snippet = "";
                if (f.content) {
                  const idx = f.content.toLowerCase().indexOf(cleanQ.toLowerCase());
                  if (idx !== -1) {
                    const start = Math.max(0, idx - 40);
                    const end = Math.min(f.content.length, idx + cleanQ.length + 60);
                    snippet =
                      (start > 0 ? "..." : "") +
                      f.content.slice(start, end).replace(/\n/g, " ") +
                      (end < f.content.length ? "..." : "");
                  }
                }
                return {
                  id: f.id,
                  path: f.path,
                  size: f.size,
                  snippet,
                  repoName: f.repo_name,
                  owner: f.owner_username,
                };
              });
            } else {
              // Direct query fallback with strict accessible repos enforcement
              // 1. Gather all repository IDs accessible to this viewer
              const accessibleRepoQuery = supabase
                .from("repositories")
                .select("id, is_private, owner_id");

              const { data: allRepos } = await accessibleRepoQuery;
              const accessibleRepoIds: string[] = [];

              if (allRepos) {
                for (const r of allRepos) {
                  if (!r.is_private) {
                    accessibleRepoIds.push(r.id);
                  } else if (viewerId && r.owner_id === viewerId) {
                    accessibleRepoIds.push(r.id);
                  }
                }

                // If viewer is signed in, check collaborator access for remaining private repos
                if (viewerId) {
                  const { data: collabRepos } = await supabase
                    .from("repo_collaborators" as any)
                    .select("repo_id")
                    .eq("user_id", viewerId);
                  for (const c of (collabRepos as any[]) || []) {
                    if (!accessibleRepoIds.includes(c.repo_id)) {
                      accessibleRepoIds.push(c.repo_id);
                    }
                  }
                }
              }

              if (accessibleRepoIds.length === 0) {
                return new Response(
                  JSON.stringify({
                    results: [],
                    count: 0,
                    query: q,
                    type: "code",
                  }),
                  { status: 200, headers: { "Content-Type": "application/json" } },
                );
              }

              // Query files strictly limited to accessible repos
              // Escape commas and parens to avoid PostgREST filter injection
              const safeQueryParam = cleanQ.replace(/[,()]/g, " ").trim();
              const { data: files, error } = await supabase
                .from("repo_files")
                .select(
                  "id, path, size, content, repositories!inner(name, is_private, profiles!repositories_owner_id_fkey(username))",
                )
                .in("repo_id", accessibleRepoIds.slice(0, 100))
                .or(`path.ilike.%${safeQueryParam}%,content.ilike.%${safeQueryParam}%`)
                .limit(30);

              if (error) throw error;

              codeResults = (files || []).map((f: any) => {
                let snippet = "";
                if (f.content) {
                  const idx = f.content.toLowerCase().indexOf(cleanQ.toLowerCase());
                  if (idx !== -1) {
                    const start = Math.max(0, idx - 40);
                    const end = Math.min(f.content.length, idx + cleanQ.length + 60);
                    snippet =
                      (start > 0 ? "..." : "") +
                      f.content.slice(start, end).replace(/\n/g, " ") +
                      (end < f.content.length ? "..." : "");
                  }
                }
                return {
                  id: f.id,
                  path: f.path,
                  size: f.size,
                  snippet,
                  repoName: f.repositories?.name,
                  owner: f.repositories?.profiles?.username,
                };
              });
            }

            return new Response(
              JSON.stringify({
                results: codeResults,
                count: codeResults.length,
                query: q,
                type: "code",
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }

          if (type === "issues") {
            const safeQueryParam = cleanQ.replace(/[,()]/g, " ").trim();
            const { data: issues, error } = await supabase
              .from("issues")
              .select(
                "id, number, title, body, state, created_at, repositories!inner(name, is_private, profiles!repositories_owner_id_fkey(username))",
              )
              .eq("repositories.is_private", false)
              .or(`title.ilike.%${safeQueryParam}%,body.ilike.%${safeQueryParam}%`)
              .order("created_at", { ascending: false })
              .limit(30);

            if (error) throw error;

            const issueResults = (issues || []).map((i: any) => ({
              id: i.id,
              number: i.number,
              title: i.title,
              state: i.state,
              created_at: i.created_at,
              repoName: i.repositories?.name,
              owner: i.repositories?.profiles?.username,
            }));

            return new Response(
              JSON.stringify({
                results: issueResults,
                count: issueResults.length,
                query: q,
                type: "issues",
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }

          if (type === "users") {
            const safeQueryParam = cleanQ.replace(/[,()]/g, " ").trim();
            const { data: users, error } = await supabase
              .from("profiles")
              .select("id, username, display_name, bio, created_at")
              .or(`username.ilike.%${safeQueryParam}%,display_name.ilike.%${safeQueryParam}%`)
              .limit(30);

            if (error) throw error;

            return new Response(
              JSON.stringify({
                results: users || [],
                count: (users || []).length,
                query: q,
                type: "users",
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }

          // Default: repositories (Public only for anonymous, or public + owned)
          const safeQueryParam = cleanQ.replace(/[,()]/g, " ").trim();
          let repoQuery = supabase
            .from("repositories")
            .select(
              "id, name, description, is_private, default_branch, stars_count, forks_count, updated_at, profiles!repositories_owner_id_fkey(username)",
            )
            .or(`name.ilike.%${safeQueryParam}%,description.ilike.%${safeQueryParam}%`)
            .eq("is_private", false)
            .order("stars_count", { ascending: false })
            .limit(30);

          const { data: repos, error } = await repoQuery;
          if (error) throw error;

          const repoResults = (repos || []).map((r: any) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            owner: r.profiles?.username,
            stars: r.stars_count || 0,
            forks: r.forks_count || 0,
            updatedAt: r.updated_at,
          }));

          return new Response(
            JSON.stringify({
              results: repoResults,
              count: repoResults.length,
              query: q,
              type: "repositories",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message || "Search failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
