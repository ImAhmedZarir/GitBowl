// src/lib/api-v1.server.ts
// GitHub-compatible REST API v1 engine with rate limiting and authentication
import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";

// In-memory sliding window rate limiter
interface RateLimitEntry {
  count: number;
  resetAt: number;
}
const rateLimitMap = new Map<string, RateLimitEntry>();

// Purge expired every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap.entries()) {
      if (entry.resetAt <= now) {
        rateLimitMap.delete(key);
      }
    }
  },
  5 * 60 * 1000,
).unref();

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

export function checkApiV1RateLimit(request: Request, userId: string | null): RateLimitResult {
  const now = Date.now();
  const windowMs = 3600 * 1000; // 1 hour
  const limit = userId ? 5000 : 60;

  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1";

  const key = userId ? `user:${userId}` : `ip:${clientIp}`;
  let entry = rateLimitMap.get(key);

  if (!entry || entry.resetAt <= now) {
    entry = { count: 1, resetAt: now + windowMs };
    rateLimitMap.set(key, entry);
  } else {
    entry.count += 1;
  }

  const remaining = Math.max(0, limit - entry.count);
  const resetSeconds = Math.ceil(entry.resetAt / 1000);

  return {
    allowed: entry.count <= limit,
    limit,
    remaining,
    reset: resetSeconds,
  };
}

export function applyRateLimitHeaders(headers: Headers, res: RateLimitResult): void {
  headers.set("X-RateLimit-Limit", res.limit.toString());
  headers.set("X-RateLimit-Remaining", res.remaining.toString());
  headers.set("X-RateLimit-Reset", res.reset.toString());
  headers.set("X-RateLimit-Used", (res.limit - res.remaining).toString());
}

export async function authenticateApiV1(request: Request): Promise<{
  userId: string | null;
  username: string | null;
  profile: any | null;
}> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { userId: null, username: null, profile: null };
  }

  const token = authHeader.slice(7).trim();
  const supabase = getSupabaseAdmin();

  // 1. Check if token is a Personal Access Token (gbp_...)
  if (token.startsWith("gbp_")) {
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const { data: pat } = await supabase
      .from("personal_access_tokens" as any)
      .select("id, user_id, expires_at")
      .eq("token_hash", hash)
      .maybeSingle();

    if (pat) {
      const patRow = pat as any;
      if (patRow.expires_at && new Date(patRow.expires_at).getTime() < Date.now()) {
        return { userId: null, username: null, profile: null };
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", patRow.user_id)
        .maybeSingle();

      return {
        userId: patRow.user_id,
        username: profile?.username || null,
        profile,
      };
    }
  }

  // 2. Otherwise try verifying as Supabase JWT
  try {
    const { data: userData } = await supabase.auth.getUser(token);
    if (userData?.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userData.user.id)
        .maybeSingle();

      return {
        userId: userData.user.id,
        username: profile?.username || null,
        profile,
      };
    }
  } catch {
    // ignore
  }

  return { userId: null, username: null, profile: null };
}

export function v1Response(data: unknown, status = 200, rateLimit?: RateLimitResult): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
  });
  if (rateLimit) {
    applyRateLimitHeaders(headers, rateLimit);
  }
  return new Response(JSON.stringify(data), { status, headers });
}

export function v1RateLimitExceeded(rateLimit: RateLimitResult): Response {
  return v1Response(
    {
      message: `API rate limit exceeded. Please wait until reset at ${new Date(rateLimit.reset * 1000).toISOString()}`,
      documentation_url: "https://gitbowl.dev/api/docs",
    },
    429,
    rateLimit,
  );
}

// Convert internal GitBowl repository to standard GitHub REST v3 format
export function formatGitHubRepo(repo: any, ownerUsername: string) {
  const isPrivate = !!repo.is_private;
  const fullName = `${ownerUsername}/${repo.name}`;
  const htmlUrl = `https://gitbowl.dev/${fullName}`;
  const apiUrl = `https://gitbowl.dev/api/v1/repos/${fullName}`;

  return {
    id: repo.id,
    node_id: Buffer.from(`repo:${repo.id}`).toString("base64"),
    name: repo.name,
    full_name: fullName,
    private: isPrivate,
    owner: {
      login: ownerUsername,
      id: repo.owner_id || repo.org_id,
      avatar_url: `https://avatar.vercel.sh/${ownerUsername}`,
      html_url: `https://gitbowl.dev/${ownerUsername}`,
      type: repo.org_id ? "Organization" : "User",
    },
    html_url: htmlUrl,
    description: repo.description || null,
    fork: !!repo.forked_from,
    url: apiUrl,
    created_at: repo.created_at,
    updated_at: repo.updated_at,
    pushed_at: repo.updated_at,
    git_url: `git://gitbowl.dev/${fullName}.git`,
    ssh_url: `git@gitbowl.dev:${fullName}.git`,
    clone_url: `https://gitbowl.dev/${fullName}.git`,
    svn_url: htmlUrl,
    default_branch: repo.default_branch || "main",
    stargazers_count: repo.stars_count || 0,
    watchers_count: repo.stars_count || 0,
    forks_count: repo.forks_count || 0,
    open_issues_count: 0,
    is_template: false,
    visibility: isPrivate ? "private" : "public",
  };
}

// Convert internal profile to standard GitHub user format
export function formatGitHubUser(profile: any) {
  return {
    login: profile.username,
    id: profile.id,
    node_id: Buffer.from(`user:${profile.id}`).toString("base64"),
    avatar_url: profile.avatar_url || `https://avatar.vercel.sh/${profile.username}`,
    html_url: `https://gitbowl.dev/${profile.username}`,
    name: profile.display_name || profile.username,
    company: null,
    blog: "",
    location: null,
    email: null,
    bio: profile.bio || null,
    public_repos: 0,
    public_gists: 0,
    followers: 0,
    following: 0,
    created_at: profile.created_at,
    updated_at: profile.updated_at || profile.created_at,
  };
}
