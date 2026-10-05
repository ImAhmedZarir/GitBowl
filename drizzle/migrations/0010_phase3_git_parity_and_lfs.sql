-- drizzle/migrations/0010_phase3_git_parity_and_lfs.sql
-- GitBowl Phase 3: Git CLI Protocol Parity & Git LFS v1 Support

-- 1. Git LFS Objects Metadata Table
CREATE TABLE IF NOT EXISTS public.lfs_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  oid text NOT NULL,
  size bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_repo_lfs_oid UNIQUE (repo_id, oid)
);

CREATE INDEX IF NOT EXISTS idx_lfs_objects_repo_oid ON public.lfs_objects(repo_id, oid);

-- 2. Git LFS Raw Storage Table (Self-contained blob storage)
CREATE TABLE IF NOT EXISTS public.lfs_data (
  oid text PRIMARY KEY,
  data text NOT NULL, -- Base64 encoded payload
  size bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lfs_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lfs_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view LFS objects of public repos" ON public.lfs_objects
  FOR SELECT TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM public.repositories r
      WHERE r.id = lfs_objects.repo_id AND (NOT r.is_private OR r.owner_id = auth.uid())
    )
  );

CREATE POLICY "Repo owners can manage LFS objects" ON public.lfs_objects
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.repositories r
      WHERE r.id = lfs_objects.repo_id AND r.owner_id = auth.uid()
    )
  );

CREATE POLICY "Anyone can read LFS blob data" ON public.lfs_data
  FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY "Authenticated users can insert LFS blob data" ON public.lfs_data
  FOR ALL TO authenticated, anon
  USING (true);

-- 3. Add lfs_objects to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE lfs_objects;
