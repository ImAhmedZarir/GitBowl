-- Migration 0005: Personal Access Tokens for Git and API access
CREATE TABLE IF NOT EXISTS public.personal_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  token_prefix text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT '{"repo"}'::text[],
  expires_at timestamptz NULL,
  last_used_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pat_user_idx ON public.personal_access_tokens(user_id);
CREATE INDEX IF NOT EXISTS pat_hash_idx ON public.personal_access_tokens(token_hash);

GRANT SELECT, INSERT, DELETE ON public.personal_access_tokens TO authenticated;
GRANT ALL ON public.personal_access_tokens TO service_role;

ALTER TABLE public.personal_access_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pat_owner_select" ON public.personal_access_tokens;
CREATE POLICY "pat_owner_select" ON public.personal_access_tokens
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "pat_owner_insert" ON public.personal_access_tokens;
CREATE POLICY "pat_owner_insert" ON public.personal_access_tokens
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "pat_owner_delete" ON public.personal_access_tokens;
CREATE POLICY "pat_owner_delete" ON public.personal_access_tokens
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
