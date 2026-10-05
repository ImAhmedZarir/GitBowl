-- Migration 0007: Phase 0 Security & Storage Foundation Fixes

-- 1. Follows Table (Replaces auth.users.user_metadata storage)
CREATE TABLE IF NOT EXISTS public.follows (
  follower_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  followee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CONSTRAINT different_users CHECK (follower_id <> followee_id)
);

CREATE INDEX IF NOT EXISTS follows_follower_idx ON public.follows(follower_id);
CREATE INDEX IF NOT EXISTS follows_followee_idx ON public.follows(followee_id);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "follows_public_read" ON public.follows;
CREATE POLICY "follows_public_read" ON public.follows
  FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "follows_user_insert" ON public.follows;
CREATE POLICY "follows_user_insert" ON public.follows
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "follows_user_delete" ON public.follows;
CREATE POLICY "follows_user_delete" ON public.follows
  FOR DELETE TO authenticated
  USING (auth.uid() = follower_id);

GRANT SELECT, INSERT, DELETE ON public.follows TO authenticated;
GRANT SELECT ON public.follows TO anon;
GRANT ALL ON public.follows TO service_role;

-- 2. Durable Outbox for Async Google Drive Backup Tier
CREATE TABLE IF NOT EXISTS public.storage_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('pack', 'blob', 'manifest')),
  sha text NOT NULL,
  size bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploading', 'done', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  drive_file_id text NULL,
  md5 text NULL,
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS storage_backups_queue_idx ON public.storage_backups(status, next_attempt_at) WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS storage_backups_repo_idx ON public.storage_backups(repo_id);

ALTER TABLE public.storage_backups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storage_backups FROM anon, authenticated;
GRANT ALL ON public.storage_backups TO service_role;

-- 3. Hardened fork_repository RPC (Authorised, Preserves is_private)
CREATE OR REPLACE FUNCTION public.fork_repository(
  p_source_repo_id uuid,
  p_new_owner_id uuid,
  p_new_name text,
  p_description text DEFAULT NULL,
  p_is_fork boolean DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_source_repo record;
  v_new_repo_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF v_caller_id <> p_new_owner_id THEN
    RAISE EXCEPTION 'Cannot fork on behalf of another user';
  END IF;

  -- Fetch source repository
  SELECT id, is_private, owner_id
  INTO v_source_repo
  FROM public.repositories
  WHERE id = p_source_repo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source repository not found';
  END IF;

  -- Authorization check: private repos can only be forked if caller is owner
  IF v_source_repo.is_private AND v_source_repo.owner_id <> v_caller_id THEN
    RAISE EXCEPTION 'Cannot fork private repository without authorization';
  END IF;

  -- Insert target repository (PRESERVING is_private: private repo fork is private)
  INSERT INTO public.repositories (
    owner_id,
    name,
    description,
    is_private,
    forked_from,
    created_at,
    updated_at
  ) VALUES (
    p_new_owner_id,
    p_new_name,
    p_description,
    v_source_repo.is_private,
    CASE WHEN p_is_fork THEN p_source_repo_id ELSE NULL END,
    now(),
    now()
  ) RETURNING id INTO v_new_repo_id;

  -- Copy files
  INSERT INTO public.repo_files (
    repo_id,
    path,
    content,
    is_binary,
    size,
    storage_path,
    sha,
    updated_at
  )
  SELECT
    v_new_repo_id,
    path,
    content,
    is_binary,
    size,
    storage_path,
    sha,
    now()
  FROM public.repo_files
  WHERE repo_id = p_source_repo_id;

  -- Increment fork count on source repo
  IF p_is_fork THEN
    UPDATE public.repositories
    SET forks_count = coalesce(forks_count, 0) + 1,
        updated_at = now()
    WHERE id = p_source_repo_id;
  END IF;

  RETURN v_new_repo_id;
END;
$$;

-- 4. Secure commit_changes RPC (Revoke public access, execute only via server service_role)
REVOKE EXECUTE ON FUNCTION public.commit_changes(uuid, uuid, text, jsonb, text[], text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_changes(uuid, uuid, text, jsonb, text[], text) TO service_role;

-- 5. Reserved Usernames Helper & Check Constraint
CREATE OR REPLACE FUNCTION public.is_reserved_username(p_username text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN lower(trim(p_username)) IN (
    'admin', 'api', 'docs', 'explore', 'settings', 'login', 'logout', 'auth',
    'new', 'issues', 'pulls', 'notifications', 'search', 'orgs', 'organizations',
    'marketplace', 'status', 'about', 'pricing', 'terms', 'privacy', 'tos',
    'security', 'help', 'support', 'blog', 'assets', 'static', 'git', 'raw',
    'sitemap', 'robots', 'favicon', 'www', 'mail', 'gitbowl'
  );
END;
$$;

-- Rename offending users if any exist before adding constraint
UPDATE public.profiles
SET username = 'user_' || substr(id::text, 1, 8)
WHERE public.is_reserved_username(username);

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS check_reserved_username;
ALTER TABLE public.profiles ADD CONSTRAINT check_reserved_username
  CHECK (NOT public.is_reserved_username(username));

-- 6. Rate limits table for Postgres-backed rate limiting (P7)
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  points integer NOT NULL DEFAULT 1,
  expire_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_key_expire ON public.rate_limits (key, expire_at);

