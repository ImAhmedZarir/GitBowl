-- drizzle/migrations/0014_part_a_security_hotfix.sql
-- Part A Security Hotfix: Admin Privilege Escalation, Search Protection, and Role Hardening

-- 1. Rename any existing offending users with reserved usernames to prevent check constraint violations
UPDATE public.profiles
SET username = 'user_' || substr(id::text, 1, 8)
WHERE lower(trim(username)) IN (
  'admin', 'api', 'docs', 'explore', 'settings', 'login', 'logout', 'auth',
  'new', 'issues', 'pulls', 'notifications', 'search', 'orgs', 'organizations',
  'marketplace', 'status', 'about', 'pricing', 'terms', 'privacy', 'tos',
  'security', 'help', 'support', 'blog', 'assets', 'static', 'git', 'raw',
  'sitemap', 'robots', 'favicon', 'www', 'mail', 'gitbowl'
);

-- Re-enforce reserved username check constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS check_reserved_username;
ALTER TABLE public.profiles ADD CONSTRAINT check_reserved_username
  CHECK (lower(trim(username)) NOT IN (
    'admin', 'api', 'docs', 'explore', 'settings', 'login', 'logout', 'auth',
    'new', 'issues', 'pulls', 'notifications', 'search', 'orgs', 'organizations',
    'marketplace', 'status', 'about', 'pricing', 'terms', 'privacy', 'tos',
    'security', 'help', 'support', 'blog', 'assets', 'static', 'git', 'raw',
    'sitemap', 'robots', 'favicon', 'www', 'mail', 'gitbowl'
  ));

-- 2. Revoke Column Updates on Profiles to prevent Privilege Escalation
-- Revoke blanket UPDATE from authenticated users
REVOKE UPDATE ON public.profiles FROM authenticated;

-- Grant UPDATE ONLY on benign, user-editable profile columns
GRANT UPDATE (display_name, bio, pinned_repo_ids) ON public.profiles TO authenticated;

-- 3. Before Update Trigger to strictly protect role and is_suspended
CREATE OR REPLACE FUNCTION public.protect_profile_roles()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_suspended IS DISTINCT FROM OLD.is_suspended) THEN
    IF (auth.role() IS DISTINCT FROM 'service_role') THEN
      RAISE EXCEPTION 'Unauthorized column update: role and is_suspended can only be modified by service role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_profile_roles ON public.profiles;
CREATE TRIGGER trg_protect_profile_roles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_roles();

-- 4. Demote any illegitimate admin rows
UPDATE public.profiles
SET role = 'user'
WHERE role = 'admin'
  AND id NOT IN (
    SELECT id FROM auth.users
    WHERE lower(email) = 'ahmedzarir07@gmail.com'
      AND (email_confirmed_at IS NOT NULL OR confirmed_at IS NOT NULL)
  );

-- 5. Parameterized, Secure Code Search Function (search_code_safe)
CREATE OR REPLACE FUNCTION public.search_code_safe(
  search_query text,
  viewer_id uuid DEFAULT NULL,
  max_results integer DEFAULT 30
)
RETURNS TABLE (
  id uuid,
  path text,
  size bigint,
  content text,
  repo_id uuid,
  repo_name text,
  owner_username text,
  is_private boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rf.id,
    rf.path,
    rf.size,
    rf.content,
    r.id AS repo_id,
    r.name AS repo_name,
    p.username AS owner_username,
    r.is_private
  FROM public.repo_files rf
  JOIN public.repositories r ON r.id = rf.repo_id
  JOIN public.profiles p ON p.id = r.owner_id
  WHERE (
    -- 1. Public repos are always searchable
    r.is_private = false
    -- 2. Owner can search their private repos
    OR (viewer_id IS NOT NULL AND r.owner_id = viewer_id)
    -- 3. Direct collaborators can search private repos
    OR (viewer_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.repo_collaborators rc
      WHERE rc.repo_id = r.id AND rc.user_id = viewer_id
    ))
    -- 4. Organization members can search org repos
    OR (viewer_id IS NOT NULL AND r.org_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = r.org_id AND om.user_id = viewer_id
    ))
  )
  AND (
    rf.path ILIKE ('%' || search_query || '%')
    OR rf.content ILIKE ('%' || search_query || '%')
  )
  LIMIT LEAST(max_results, 30);
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_code_safe(text, uuid, integer) TO anon, authenticated, service_role;
