-- Migration 0004: Activity events table and statistics RPC
-- All tables have Row Level Security enabled.

CREATE TABLE IF NOT EXISTS public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  repo_id uuid REFERENCES public.repositories(id) ON DELETE CASCADE,
  event_type text NOT NULL, -- 'push', 'star', 'fork', 'issue', 'pr'
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_events_repo_idx ON public.activity_events(repo_id);
CREATE INDEX IF NOT EXISTS activity_events_user_idx ON public.activity_events(user_id);
CREATE INDEX IF NOT EXISTS activity_events_created_idx ON public.activity_events(created_at DESC);

GRANT SELECT ON public.activity_events TO anon;
GRANT SELECT, INSERT ON public.activity_events TO authenticated;
GRANT ALL ON public.activity_events TO service_role;

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public activity readable" ON public.activity_events
  FOR SELECT USING (
    repo_id IS NULL OR EXISTS (
      SELECT 1 FROM public.repositories r
      WHERE r.id = activity_events.repo_id AND (r.is_private = false OR r.owner_id = auth.uid())
    )
  );

CREATE POLICY "authenticated user insert activity" ON public.activity_events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Helper RPC for fast live stats count
CREATE OR REPLACE FUNCTION public.get_platform_stats()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'repositories', (SELECT count(*) FROM public.repositories WHERE is_private = false),
    'developers', (SELECT count(*) FROM public.profiles),
    'commits', (SELECT count(*) FROM public.commits)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_platform_stats() TO anon, authenticated, service_role;
