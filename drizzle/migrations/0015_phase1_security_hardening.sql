-- drizzle/migrations/0015_phase1_security_hardening.sql
-- Phase 1: Security Hardening, Native OAuth Onboarding & Email Lookup RPC
-- Idempotent and safe to run on live database.
--
-- Rollback note:
-- To rollback:
--   DROP FUNCTION IF EXISTS public.get_user_id_by_email(text);
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS onboarding_completed;

-- 1. Add onboarding_completed flag to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark existing valid profiles as onboarding completed so existing users aren't re-prompted
UPDATE public.profiles 
SET onboarding_completed = TRUE 
WHERE username IS NOT NULL 
  AND username != ''
  AND onboarding_completed = FALSE;

-- 2. Add high-scale SECURITY DEFINER helper to lookup auth user by email (service_role only)
-- Replaces O(N) listUsers() pagination
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(lookup_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  matching_user_id uuid;
BEGIN
  IF lookup_email IS NULL OR trim(lookup_email) = '' THEN
    RETURN NULL;
  END IF;

  SELECT id INTO matching_user_id
  FROM auth.users
  WHERE lower(email) = lower(trim(lookup_email))
  LIMIT 1;

  RETURN matching_user_id;
END;
$$;

-- Restrict to service_role only (critical security requirement)
REVOKE ALL ON FUNCTION public.get_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO service_role;

-- 3. Update handle_new_user trigger to leave onboarding_completed = false
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  suggested_username text;
  candidate text;
  suffix int := 0;
BEGIN
  -- Extract username from metadata or email prefix
  suggested_username := lower(trim(COALESCE(
    new.raw_user_meta_data->>'user_name',
    new.raw_user_meta_data->>'preferred_username',
    new.raw_user_meta_data->>'username',
    split_part(new.email, '@', 1)
  )));

  -- Clean non-alphanumeric except hyphen
  suggested_username := regexp_replace(suggested_username, '[^a-z0-9-]', '', 'g');
  
  -- Ensure non-empty and length within limits
  IF suggested_username IS NULL OR suggested_username = '' OR length(suggested_username) < 3 THEN
    suggested_username := 'user-' || substr(md5(new.id::text), 1, 8);
  ELSIF length(suggested_username) > 30 THEN
    suggested_username := substr(suggested_username, 1, 30);
  END IF;

  candidate := suggested_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = candidate) LOOP
    suffix := suffix + 1;
    candidate := suggested_username || '-' || suffix;
  END LOOP;

  INSERT INTO public.profiles (
    id,
    username,
    display_name,
    avatar_url,
    bio,
    created_at,
    updated_at,
    onboarding_completed
  )
  VALUES (
    new.id,
    candidate,
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', candidate),
    COALESCE(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', ''),
    '',
    now(),
    now(),
    FALSE -- User must confirm/complete onboarding
  )
  ON CONFLICT (id) DO UPDATE SET
    avatar_url = EXCLUDED.avatar_url,
    updated_at = now();

  RETURN new;
END;
$$;
