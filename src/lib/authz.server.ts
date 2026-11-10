// src/lib/authz.server.ts
// Unified Central Authorization Layer for GitBowl
import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";

export interface Actor {
  userId: string;
  username: string;
  email?: string;
  role?: string;
  scopes: string[];
  isPAT: boolean;
  isSuspended: boolean;
}

export type AccessLevel = "read" | "triage" | "write" | "admin";

const LEVEL_WEIGHT: Record<AccessLevel, number> = {
  read: 1,
  triage: 2,
  write: 3,
  admin: 4,
};

export interface RepoAccessResult {
  allowed: boolean;
  status: number;
  error?: string;
  level?: AccessLevel;
}

/**
 * Extracts and strictly verifies the authenticated actor from any HTTP request:
 * - Supabase JWT (Bearer <token>)
 * - Personal Access Token (Bearer gbp_<token>)
 * - HTTP Basic Auth (username + PAT / password)
 *
 * Checks `profiles.is_suspended` and rejects suspended accounts immediately.
 * Never trusts user IDs from the request body or unverified headers.
 */
export async function getActor(request: Request): Promise<Actor | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;

  const supabase = getSupabaseAdmin();

  // 1. Bearer Token Auth
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const rawToken = authHeader.slice(7).trim();
    if (!rawToken) return null;

    // A. Personal Access Token (gbp_...)
    if (rawToken.startsWith("gbp_")) {
      return resolvePatActor(rawToken);
    }

    // B. Supabase JWT
    try {
      const { data: userData, error: authErr } = await supabase.auth.getUser(rawToken);
      if (authErr || !userData?.user) return null;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, username, role, is_suspended")
        .eq("id", userData.user.id)
        .maybeSingle();

      if ((profile as any)?.is_suspended) {
        return null;
      }

      return {
        userId: userData.user.id,
        username: profile?.username || "developer",
        email: userData.user.email,
        role: profile?.role || "user",
        scopes: ["*"], // Full session token
        isPAT: false,
        isSuspended: Boolean((profile as any)?.is_suspended),
      };
    } catch {
      return null;
    }
  }

  // 2. HTTP Basic Auth
  if (authHeader.toLowerCase().startsWith("basic ")) {
    const b64 = authHeader.slice(6).trim();
    let decoded = "";
    try {
      decoded = Buffer.from(b64, "base64").toString("utf-8");
    } catch {
      return null;
    }

    const colonIdx = decoded.indexOf(":");
    if (colonIdx === -1) return null;

    const username = decoded.slice(0, colonIdx).trim();
    const password = decoded.slice(colonIdx + 1).trim();

    if (password.startsWith("gbp_")) {
      return resolvePatActor(password);
    }

    // Authenticate via Supabase password
    try {
      // Find user email from username or email
      let email = username;
      if (!email.includes("@")) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("id")
          .ilike("username", username)
          .maybeSingle();

        if (prof) {
          const { data: uData } = await supabase.auth.admin.getUserById(prof.id);
          if (uData?.user?.email) email = uData.user.email;
        }
      }

      const { data: authRes, error: passErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (passErr || !authRes?.user) return null;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, username, role, is_suspended")
        .eq("id", authRes.user.id)
        .maybeSingle();

      if ((profile as any)?.is_suspended) return null;

      return {
        userId: authRes.user.id,
        username: profile?.username || username,
        email: authRes.user.email,
        role: profile?.role || "user",
        scopes: ["*"],
        isPAT: false,
        isSuspended: false,
      };
    } catch {
      return null;
    }
  }

  return null;
}

async function resolvePatActor(rawToken: string): Promise<Actor | null> {
  const supabase = getSupabaseAdmin();
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const { data: pat } = await supabase
    .from("personal_access_tokens" as any)
    .select("id, user_id, scopes, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!pat) return null;
  const p = pat as any;

  if (p.expires_at && new Date(p.expires_at).getTime() < Date.now()) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, role, is_suspended")
    .eq("id", p.user_id)
    .maybeSingle();

  if ((profile as any)?.is_suspended) {
    return null;
  }

  // Update last_used_at asynchronously
  void supabase
    .from("personal_access_tokens" as any)
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", p.id);

  const rawScopes = Array.isArray(p.scopes) ? p.scopes : (p.scopes || "").split(",").map((s: string) => s.trim()).filter(Boolean);

  return {
    userId: p.user_id,
    username: profile?.username || "developer",
    role: profile?.role || "user",
    scopes: rawScopes.length > 0 ? rawScopes : ["repo:read", "repo:write"],
    isPAT: true,
    isSuspended: Boolean((profile as any)?.is_suspended),
  };
}

/**
 * Resolves a repository strictly by exact (owner, name) matching.
 * Never uses ilike on unescaped names or matches by repo name alone.
 */
export async function findRepo(owner: string, name: string) {
  const cleanOwner = (owner || "").trim().toLowerCase();
  const cleanName = (name || "").trim().toLowerCase().replace(/\.git$/i, "");
  if (!cleanOwner || !cleanName) return null;

  const supabase = getSupabaseAdmin();

  // Find repository with exact matching name
  const { data: repos, error } = await supabase
    .from("repositories")
    .select("*, profiles!repositories_owner_id_fkey(username, display_name)")
    .eq("name", cleanName);

  if (error || !repos || repos.length === 0) return null;

  for (const r of repos) {
    const ownerUsername = ((r.profiles as any)?.username || "").toLowerCase();
    if (ownerUsername === cleanOwner) {
      return r;
    }

    if (r.org_id) {
      const { data: org } = await supabase
        .from("orgs" as any)
        .select("slug")
        .eq("id", r.org_id)
        .maybeSingle();

      if ((org as any)?.slug?.toLowerCase() === cleanOwner) {
        return r;
      }
    }
  }

  return null;
}

/**
 * Checks whether an actor has the required access level on a repository:
 * Hierarchy: admin > write > triage > read
 *
 * Rules:
 * - Public repo: anyone has 'read'.
 * - Private repo: unauthorized users receive genuine 404 to avoid leaking existence.
 * - Repo owner has 'admin'.
 * - Collaborators have assigned level ('admin', 'write', 'read').
 * - Org owners/admins have 'admin'. Org members have 'read'.
 * - Team repository permissions take precedence for org members.
 * - PAT scopes are validated ('repo:read', 'repo:write').
 */
export async function requireRepoAccess(
  actor: Actor | null,
  repo: any,
  requiredLevel: AccessLevel = "read",
): Promise<RepoAccessResult> {
  if (!repo) {
    return { allowed: false, status: 404, error: "Repository not found" };
  }

  const isPrivate = Boolean(repo.is_private);
  const reqWeight = LEVEL_WEIGHT[requiredLevel];

  // 1. If public repository and only 'read' is needed:
  if (!isPrivate && requiredLevel === "read") {
    return { allowed: true, status: 200, level: "read" };
  }

  // 2. If action requires authentication and actor is missing:
  if (!actor) {
    if (isPrivate) {
      // 404 cloaking for private repos
      return { allowed: false, status: 404, error: "Repository not found" };
    }
    return { allowed: false, status: 401, error: "Authentication required" };
  }

  // Suspended users always denied
  if (actor.isSuspended) {
    return { allowed: false, status: 403, error: "Account suspended" };
  }

  // 3. Determine Actor's access level on this repository
  let grantedLevel: AccessLevel | null = null;

  // A. Repository Owner
  if (actor.userId === repo.owner_id) {
    grantedLevel = "admin";
  }

  const supabase = getSupabaseAdmin();

  // B. Collaborators table
  if (!grantedLevel) {
    const { data: collab } = await supabase
      .from("collaborators" as any)
      .select("permission")
      .eq("repo_id", repo.id)
      .eq("user_id", actor.userId)
      .maybeSingle();

    if (collab) {
      const p = (collab as any).permission?.toLowerCase();
      if (p === "admin") grantedLevel = "admin";
      else if (p === "write" || p === "push") grantedLevel = "write";
      else if (p === "triage") grantedLevel = "triage";
      else grantedLevel = "read";
    }
  }

  // C. Organisation membership & Team permissions
  if (!grantedLevel && repo.org_id) {
    const { data: orgMember } = await supabase
      .from("org_members" as any)
      .select("role")
      .eq("org_id", repo.org_id)
      .eq("user_id", actor.userId)
      .maybeSingle();

    if (orgMember) {
      const role = (orgMember as any).role?.toLowerCase();
      if (role === "owner" || role === "admin") {
        grantedLevel = "admin";
      } else {
        // Org member base permission is read
        grantedLevel = "read";

        // Check team_repo_permissions for member's teams
        const { data: teamMemberships } = await supabase
          .from("team_members" as any)
          .select("team_id")
          .eq("user_id", actor.userId);

        if (teamMemberships && teamMemberships.length > 0) {
          const teamIds = teamMemberships.map((t: any) => t.team_id);
          const { data: teamPerms } = await supabase
            .from("team_repo_permissions" as any)
            .select("permission")
            .eq("repo_id", repo.id)
            .in("team_id", teamIds);

          if (teamPerms && teamPerms.length > 0) {
            for (const tp of teamPerms) {
              const perm = (tp as any).permission?.toLowerCase();
              if (perm === "admin") grantedLevel = "admin";
              else if (perm === "write" && grantedLevel !== "admin") grantedLevel = "write";
              else if (perm === "triage" && !["admin", "write"].includes(grantedLevel)) grantedLevel = "triage";
            }
          }
        }
      }
    }
  }

  // 4. Verify PAT scopes if authenticated via PAT
  if (actor.isPAT && grantedLevel) {
    const scopes = actor.scopes;
    const hasWildcard = scopes.includes("*");
    const hasWriteScope = hasWildcard || scopes.includes("repo:write") || scopes.includes("repo");
    const hasReadScope = hasWriteScope || scopes.includes("repo:read");

    if (reqWeight >= LEVEL_WEIGHT.write && !hasWriteScope) {
      return { allowed: false, status: 403, error: "Personal Access Token missing 'repo:write' scope" };
    }
    if (reqWeight >= LEVEL_WEIGHT.read && !hasReadScope) {
      return { allowed: false, status: 403, error: "Personal Access Token missing 'repo:read' scope" };
    }
  }

  // 5. Evaluate final access against required level
  if (grantedLevel && LEVEL_WEIGHT[grantedLevel] >= reqWeight) {
    return { allowed: true, status: 200, level: grantedLevel };
  }

  // If public and read weight
  if (!isPrivate && reqWeight <= LEVEL_WEIGHT.read) {
    return { allowed: true, status: 200, level: "read" };
  }

  // Unauthorized
  if (isPrivate && (!grantedLevel || LEVEL_WEIGHT[grantedLevel] < LEVEL_WEIGHT.read)) {
    return { allowed: false, status: 404, error: "Repository not found" };
  }

  return { allowed: false, status: 403, error: "Forbidden: insufficient repository permissions" };
}
