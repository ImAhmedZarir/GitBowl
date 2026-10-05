-- drizzle/migrations/0012_phase5_github_sync_and_api_v1.sql
-- GitBowl Phase 5: GitHub Sync, REST API v1 Rate Limiting & Mobile Polish

-- 1. Repository GitHub Sync Configuration
CREATE TABLE IF NOT EXISTS public.repo_github_sync (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE UNIQUE,
  github_owner text NOT NULL,
  github_repo text NOT NULL,
  access_token text,
  sync_direction text NOT NULL DEFAULT 'mirror_to_github' CHECK (sync_direction IN ('mirror_to_github', 'pull_from_github', 'bidirectional')),
  conflict_strategy text NOT NULL DEFAULT 'gitbowl_wins' CHECK (conflict_strategy IN ('gitbowl_wins', 'github_wins')),
  last_synced_at timestamptz,
  sync_status text NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced', 'syncing', 'error')),
  last_error text,
  webhook_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_repo_github_sync_repo ON public.repo_github_sync(repo_id);

-- 2. API v1 Rate Limiting & Usage Tracking
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL, -- user_id or IP address
  request_count int NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_rate_limit_id UNIQUE (identifier)
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_window ON public.api_rate_limits(window_start);

-- Enable RLS
ALTER TABLE public.repo_github_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

-- Policies for GitHub Sync: repo owner/collaborator can view/manage
CREATE POLICY "Repo owners can manage github sync" ON public.repo_github_sync
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.repositories r
      WHERE r.id = repo_github_sync.repo_id AND r.owner_id = auth.uid()
    )
  );

CREATE POLICY "Anyone can view github sync status for public repos" ON public.repo_github_sync
  FOR SELECT TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM public.repositories r
      WHERE r.id = repo_github_sync.repo_id AND r.is_private = false
    )
  );

-- System can manage rate limits
CREATE POLICY "System can manage rate limits" ON public.api_rate_limits
  FOR ALL TO authenticated, anon
  USING (true)
  WITH CHECK (true);

-- Realtime Publication
ALTER PUBLICATION supabase_realtime ADD TABLE repo_github_sync;
