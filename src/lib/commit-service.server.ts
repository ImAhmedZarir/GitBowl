// src/lib/commit-service.server.ts
// Single authoritative server-side commit engine with strict JWT/PAT auth,
// optimistic locking (expectedHeadSha), and durable outbox backup queue.
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sanitizeFileRecord, sanitizeCommitMessage, sanitizeFilePath } from "@/lib/unicode";

export interface CommitFileChange {
  path: string;
  content?: string;
  is_binary?: boolean;
}

export interface CommitChangesParams {
  repoId: string;
  authHeader: string | null;
  message: string;
  files?: CommitFileChange[];
  expectedHeadSha?: string | null;
  branch?: string;
}

export interface AuthUser {
  id: string;
  email?: string | null | undefined;
  username?: string | null | undefined;
}

/**
 * Resolves authenticated user strictly from JWT or Personal Access Token.
 * Never trusts client-supplied user or author parameters.
 */
export async function resolveAuthUser(authHeader: string | null): Promise<AuthUser | null> {
  if (!authHeader) return null;

  // 1. Bearer Token (Supabase JWT or PAT)
  if (authHeader.startsWith("Bearer ")) {
    const rawToken = authHeader.slice(7).trim();
    if (!rawToken) return null;

    if (rawToken.startsWith("gbp_")) {
      // Personal Access Token
      const hash = createHash("sha256").update(rawToken).digest("hex");
      const { data: pat, error: patErr } = await supabaseAdmin
        .from("personal_access_tokens")
        .select("id, user_id, expires_at, scopes")
        .eq("token_hash", hash)
        .maybeSingle();

      if (patErr || !pat) return null;
      if (pat.expires_at && new Date(pat.expires_at) <= new Date()) return null;

      // Update last_used_at
      void supabaseAdmin
        .from("personal_access_tokens")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", pat.id);

      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("id, username")
        .eq("id", pat.user_id)
        .maybeSingle();

      return profile ? { id: profile.id, username: profile.username } : { id: pat.user_id };
    }

    // Supabase JWT
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(rawToken);

    if (error || !user) return null;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, username")
      .eq("id", user.id)
      .maybeSingle();

    return {
      id: user.id,
      email: user.email,
      username: profile?.username,
    };
  }

  // 2. Basic Auth (Username / PAT for Git CLI)
  if (authHeader.startsWith("Basic ")) {
    const creds = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
    const idx = creds.indexOf(":");
    if (idx === -1) return null;
    const password = creds.slice(idx + 1);

    if (password.startsWith("gbp_")) {
      const hash = createHash("sha256").update(password).digest("hex");
      const { data: pat } = await supabaseAdmin
        .from("personal_access_tokens")
        .select("id, user_id, expires_at")
        .eq("token_hash", hash)
        .maybeSingle();

      if (!pat || (pat.expires_at && new Date(pat.expires_at) <= new Date())) return null;

      void supabaseAdmin
        .from("personal_access_tokens")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", pat.id);

      return { id: pat.user_id };
    }
  }

  return null;
}

export class CommitError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Executes an atomic, authenticated commit with optimistic concurrency control.
 */
export async function commitChanges(params: CommitChangesParams) {
  const { repoId, authHeader, message, expectedHeadSha } = params;
  const files = params.files || [];

  if (!repoId) throw new CommitError("Repository ID is required", 400);

  // 1. Strict Authentication
  const user = await resolveAuthUser(authHeader);
  if (!user) {
    throw new CommitError("Authentication required to commit changes", 401);
  }

  // 2. Authorization Check (Fetch repo and verify owner/collaborator)
  const { data: repo, error: repoErr } = await supabaseAdmin
    .from("repositories")
    .select("id, name, owner_id, org_id, is_private, head_sha, default_branch")
    .eq("id", repoId)
    .single();

  if (repoErr || !repo) {
    throw new CommitError("Repository not found", 404);
  }

  let hasWriteAccess = repo.owner_id === user.id;

  // Check direct repository collaborators
  if (!hasWriteAccess) {
    const { data: collab } = await supabaseAdmin
      .from("repo_collaborators" as any)
      .select("permission")
      .eq("repo_id", repo.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (collab && ["write", "maintain", "admin"].includes((collab as any).permission)) {
      hasWriteAccess = true;
    }
  }

  // Check organization membership and team repo permissions if repository belongs to an organization
  if (!hasWriteAccess && repo.org_id) {
    const { data: member } = await supabaseAdmin
      .from("org_members" as any)
      .select("role")
      .eq("org_id", repo.org_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (member && ["owner", "admin", "member"].includes(member.role)) {
      hasWriteAccess = true;
    }

    if (!hasWriteAccess) {
      const { data: userTeams } = await supabaseAdmin
        .from("team_members" as any)
        .select("team_id")
        .eq("user_id", user.id);

      if (userTeams && userTeams.length > 0) {
        const teamIds = (userTeams as any[]).map((t: any) => t.team_id);
        const { data: teamPerms } = await supabaseAdmin
          .from("team_repo_permissions" as any)
          .select("permission")
          .eq("repo_id", repo.id)
          .in("team_id", teamIds);

        if (
          (teamPerms as any[])?.some((p: any) =>
            ["write", "maintain", "admin"].includes(p.permission),
          )
        ) {
          hasWriteAccess = true;
        }
      }
    }
  }

  // Check system administrator privileges
  if (!hasWriteAccess) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role === "admin") {
      hasWriteAccess = true;
    }
  }

  if (!hasWriteAccess) {
    throw new CommitError("You do not have write permissions for this repository", 403);
  }

  // 3. Optimistic Concurrency Control
  if (expectedHeadSha && repo.head_sha && repo.head_sha !== expectedHeadSha) {
    throw new CommitError(
      "The branch tip has changed since you opened this file. Please reload the page to merge or review recent changes.",
      409,
    );
  }

  // 4. Compute New Commit SHA
  const now = new Date().toISOString();
  const commitMsg = sanitizeCommitMessage(message, "Update files");
  const parentSha = repo.head_sha || "0000000000000000000000000000000000000000";

  // Sanitize each file record for complete database and unicode safety
  const sanitizedFiles = files.map((f) =>
    sanitizeFileRecord({
      path: f.path,
      content: f.content ?? "",
      is_binary: Boolean(f.is_binary),
    }),
  );

  const newCommitSha = createHash("sha1")
    .update(
      `${parentSha}:${user.id}:${commitMsg}:${now}:${sanitizedFiles.map((f) => f.path).join(",")}`,
    )
    .digest("hex");

  // 5. Atomic File Upserts
  const upserts = sanitizedFiles.map((f) => ({
    repo_id: repoId,
    path: f.path,
    content: f.content,
    is_binary: f.is_binary,
    size: f.size,
    updated_at: now,
  }));

  const { error: upsertErr } = await supabaseAdmin
    .from("repo_files")
    .upsert(upserts, { onConflict: "repo_id,path" });

  if (upsertErr) {
    throw new CommitError(`Database file write failed: ${upsertErr.message}`, 500);
  }

  // 6. Record Commit in Database
  const { data: newCommit, error: commitErr } = await supabaseAdmin
    .from("commits")
    .insert({
      repo_id: repoId,
      author_id: user.id, // Strictly use verified authenticated user ID!
      message: commitMsg,
      changes: sanitizedFiles.map((f) => ({ path: f.path, type: "modified" })),
      created_at: now,
    })
    .select()
    .single();

  if (commitErr || !newCommit) {
    throw new CommitError(`Commit record creation failed: ${commitErr?.message}`, 500);
  }

  // 7. Update Repository Head SHA & Updated Timestamp
  await supabaseAdmin
    .from("repositories")
    .update({
      head_sha: newCommitSha,
      updated_at: now,
    })
    .eq("id", repoId);

  // 8. Enqueue Async Durable Backup in storage_backups
  await supabaseAdmin.from("storage_backups").insert({
    repo_id: repoId,
    kind: "pack",
    sha: newCommitSha,
    size: upserts.reduce((acc, f) => acc + f.size, 0),
    status: "pending",
    attempts: 0,
    next_attempt_at: now,
    created_at: now,
  });

  // 9. Dispatch Webhooks
  try {
    const { dispatchRepoWebhooks } = await import("@/lib/webhooks.server");
    void dispatchRepoWebhooks({
      repoId,
      event: "push",
      payload: {
        ref: `refs/heads/${params.branch || repo.default_branch || "main"}`,
        before: repo.head_sha || "0000000000000000000000000000000000000000",
        after: newCommitSha,
        repository: { id: repo.id, name: repo.name },
        pusher: { id: user.id, username: user.username, email: user.email },
        commits: [
          {
            id: newCommitSha,
            message: message.trim(),
            timestamp: now,
            author: { username: user.username, email: user.email },
          },
        ],
      },
    });
  } catch (webhookErr) {
    console.error("[Commit] Failed to dispatch webhooks:", webhookErr);
  }

  return {
    success: true,
    commitId: newCommit.id,
    sha: newCommitSha,
    commitSha: newCommitSha,
    commit: newCommit,
    filesCount: files.length,
  };
}

export async function createCommit(params: {
  repoId: string;
  authorId: string;
  branch?: string;
  message: string;
  files: CommitFileChange[];
}): Promise<{ commitId: string }> {
  const sanitizedList: CommitFileChange[] = [];
  for (const f of params.files) {
    if (f.content !== undefined) {
      const sanitized = sanitizeFileRecord({
        path: f.path,
        content: f.content,
        is_binary: Boolean(f.is_binary),
      });
      sanitizedList.push(sanitized);

      await supabaseAdmin.from("repo_files" as any).upsert(
        {
          repo_id: params.repoId,
          path: sanitized.path,
          content: sanitized.content,
          is_binary: sanitized.is_binary,
          size: sanitized.size,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "repo_id,path" },
      );
    }
  }

  const { data: commitRow, error } = await supabaseAdmin
    .from("commits" as any)
    .insert({
      repo_id: params.repoId,
      author_id: params.authorId,
      message: sanitizeCommitMessage(params.message, "Update files"),
      changes: sanitizedList.map((f) => ({ path: sanitizeFilePath(f.path), type: "modified" })),
    })
    .select()
    .single();

  if (error) throw error;
  return { commitId: (commitRow as any).id };
}
