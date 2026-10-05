-- drizzle/migrations/0009_phase2_platform_features.sql
-- GitBowl Phase 2: Webhooks, Pages, Releases, Insights & Full-Text Search

-- 1. Webhooks Table
CREATE TABLE IF NOT EXISTS public.webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  url text NOT NULL,
  secret text NOT NULL DEFAULT '',
  events text[] NOT NULL DEFAULT '{"push"}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_repo ON public.webhooks(repo_id);

ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Repo owners can manage webhooks" ON public.webhooks
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.repositories r
      WHERE r.id = webhooks.repo_id AND r.owner_id = auth.uid()
    )
  );

-- 2. Webhook Deliveries Table
CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid NOT NULL REFERENCES public.webhooks(id) ON DELETE CASCADE,
  event text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status_code integer,
  response_body text,
  duration_ms integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON public.webhook_deliveries(webhook_id, created_at DESC);

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Repo owners can view webhook deliveries" ON public.webhook_deliveries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.webhooks w
      JOIN public.repositories r ON r.id = w.repo_id
      WHERE w.id = webhook_deliveries.webhook_id AND r.owner_id = auth.uid()
    )
  );

CREATE POLICY "System can record webhook deliveries" ON public.webhook_deliveries
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

-- 3. GitBowl Pages Configuration Table
CREATE TABLE IF NOT EXISTS public.pages_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE UNIQUE,
  is_enabled boolean NOT NULL DEFAULT false,
  branch text NOT NULL DEFAULT 'main',
  path text NOT NULL DEFAULT '/',
  custom_domain text,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'building', 'error')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pages_config_repo ON public.pages_config(repo_id);

ALTER TABLE public.pages_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view enabled pages config" ON public.pages_config
  FOR SELECT TO authenticated, anon
  USING (is_enabled = true);

CREATE POLICY "Repo owners can manage pages config" ON public.pages_config
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.repositories r
      WHERE r.id = pages_config.repo_id AND r.owner_id = auth.uid()
    )
  );

-- 4. Releases Table
CREATE TABLE IF NOT EXISTS public.releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  tag_name text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  is_draft boolean NOT NULL DEFAULT false,
  is_prerelease boolean NOT NULL DEFAULT false,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_repo_tag UNIQUE (repo_id, tag_name)
);

CREATE INDEX IF NOT EXISTS idx_releases_repo ON public.releases(repo_id, published_at DESC);

ALTER TABLE public.releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published releases of accessible repos" ON public.releases
  FOR SELECT TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM public.repositories r
      WHERE r.id = releases.repo_id AND (NOT r.is_private OR r.owner_id = auth.uid())
    )
  );

CREATE POLICY "Repo owners can manage releases" ON public.releases
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.repositories r
      WHERE r.id = releases.repo_id AND r.owner_id = auth.uid()
    )
  );

-- 5. Release Assets Table
CREATE TABLE IF NOT EXISTS public.release_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  name text NOT NULL,
  size bigint NOT NULL DEFAULT 0,
  download_count integer NOT NULL DEFAULT 0,
  storage_path text NOT NULL,
  content_type text DEFAULT 'application/octet-stream',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.release_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view release assets of accessible repos" ON public.release_assets
  FOR SELECT TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM public.releases rel
      JOIN public.repositories r ON r.id = rel.repo_id
      WHERE rel.id = release_assets.release_id AND (NOT r.is_private OR r.owner_id = auth.uid())
    )
  );

CREATE POLICY "Repo owners can manage release assets" ON public.release_assets
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.releases rel
      JOIN public.repositories r ON r.id = rel.repo_id
      WHERE rel.id = release_assets.release_id AND r.owner_id = auth.uid()
    )
  );

-- 6. Full-Text Search Indexes
CREATE INDEX IF NOT EXISTS idx_repos_ft_name ON public.repositories USING gin(to_tsvector('english', name || ' ' || coalesce(description, '')));
CREATE INDEX IF NOT EXISTS idx_issues_ft ON public.issues USING gin(to_tsvector('english', title || ' ' || coalesce(body, '')));
CREATE INDEX IF NOT EXISTS idx_files_path ON public.repo_files(path);

-- 7. Add tables to Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE webhooks, webhook_deliveries, releases, pages_config;
