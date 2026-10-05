-- drizzle/migrations/0008_phase1_admin_and_prs.sql
-- GitBowl Phase 1: Admin Panel, Audit Logs, Branches, Pull Requests & Code Reviews

-- 1. Profiles Role & Admin Flag
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN role text NOT NULL DEFAULT 'user' 
      CHECK (role IN ('user', 'admin', 'staff'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_suspended'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN is_suspended boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'pinned_repo_ids'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN pinned_repo_ids uuid[] DEFAULT '{}';
  END IF;
END $$;

-- Update admin email if present
UPDATE public.profiles
SET role = 'admin'
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'ahmedzarir07@gmail.com'
);

-- 2. Audit Log Table (P1.1)
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON public.audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.audit_log(action);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs
CREATE POLICY "Admins can view audit logs" ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "System and admins can insert audit logs" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 3. Git Refs Table (Branches & Tags)
CREATE TABLE IF NOT EXISTS public.refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  name text NOT NULL, -- e.g. 'refs/heads/main', 'refs/heads/feat-login', 'refs/tags/v1.0'
  sha text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_repo_ref_name UNIQUE (repo_id, name)
);

CREATE INDEX IF NOT EXISTS idx_refs_repo_name ON public.refs(repo_id, name);

ALTER TABLE public.refs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view public refs" ON public.refs
  FOR SELECT TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM public.repositories r
      WHERE r.id = refs.repo_id AND (NOT r.is_private OR r.owner_id = auth.uid())
    )
  );

CREATE POLICY "Repo owners can modify refs" ON public.refs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.repositories r
      WHERE r.id = refs.repo_id AND r.owner_id = auth.uid()
    )
  );

-- 4. Branch Protections Table
CREATE TABLE IF NOT EXISTS public.branch_protections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  branch_pattern text NOT NULL,
  require_pr boolean NOT NULL DEFAULT true,
  required_approvals integer NOT NULL DEFAULT 1,
  block_force_push boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_repo_branch_pattern UNIQUE (repo_id, branch_pattern)
);

ALTER TABLE public.branch_protections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone with repo access can view branch protection" ON public.branch_protections
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.repositories r
      WHERE r.id = branch_protections.repo_id AND (NOT r.is_private OR r.owner_id = auth.uid())
    )
  );

CREATE POLICY "Repo owners can manage branch protection" ON public.branch_protections
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.repositories r
      WHERE r.id = branch_protections.repo_id AND r.owner_id = auth.uid()
    )
  );

-- 5. Pull Requests Table (P1.2)
CREATE TABLE IF NOT EXISTS public.pull_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  number integer NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'closed', 'merged')),
  source_branch text NOT NULL,
  target_branch text NOT NULL DEFAULT 'main',
  source_repo_id uuid REFERENCES public.repositories(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  merge_commit_sha text,
  is_draft boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  merged_at timestamptz,
  closed_at timestamptz,
  CONSTRAINT uq_repo_pr_number UNIQUE (repo_id, number)
);

CREATE INDEX IF NOT EXISTS idx_prs_repo_state ON public.pull_requests(repo_id, state);
CREATE INDEX IF NOT EXISTS idx_prs_author ON public.pull_requests(author_id);

ALTER TABLE public.pull_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view PRs of accessible repos" ON public.pull_requests
  FOR SELECT TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM public.repositories r
      WHERE r.id = pull_requests.repo_id AND (NOT r.is_private OR r.owner_id = auth.uid())
    )
  );

CREATE POLICY "Authenticated users can create PRs" ON public.pull_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors and repo owners can update PRs" ON public.pull_requests
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = author_id OR
    EXISTS (
      SELECT 1 FROM public.repositories r
      WHERE r.id = pull_requests.repo_id AND r.owner_id = auth.uid()
    )
  );

-- 6. Pull Request Reviews Table
CREATE TABLE IF NOT EXISTS public.pull_request_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pull_request_id uuid NOT NULL REFERENCES public.pull_requests(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('approved', 'changes_requested', 'commented')),
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pr_reviews_pr ON public.pull_request_reviews(pull_request_id);

ALTER TABLE public.pull_request_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone with PR access can view reviews" ON public.pull_request_reviews
  FOR SELECT TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM public.pull_requests pr
      JOIN public.repositories r ON r.id = pr.repo_id
      WHERE pr.id = pull_request_reviews.pull_request_id
        AND (NOT r.is_private OR r.owner_id = auth.uid())
    )
  );

CREATE POLICY "Authenticated users can submit reviews" ON public.pull_request_reviews
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reviewer_id);

-- 7. Pull Request Comments Table (Conversation & Inline)
CREATE TABLE IF NOT EXISTS public.pull_request_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pull_request_id uuid NOT NULL REFERENCES public.pull_requests(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  body text NOT NULL,
  file_path text,
  line_number integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pr_comments_pr ON public.pull_request_comments(pull_request_id);

ALTER TABLE public.pull_request_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone with PR access can view comments" ON public.pull_request_comments
  FOR SELECT TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM public.pull_requests pr
      JOIN public.repositories r ON r.id = pr.repo_id
      WHERE pr.id = pull_request_comments.pull_request_id
        AND (NOT r.is_private OR r.owner_id = auth.uid())
    )
  );

CREATE POLICY "Authenticated users can post comments" ON public.pull_request_comments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);

-- 8. Add all new tables to Supabase Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE pull_requests, pull_request_reviews, pull_request_comments, refs, audit_log;
