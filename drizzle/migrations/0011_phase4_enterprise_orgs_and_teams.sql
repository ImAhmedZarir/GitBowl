-- drizzle/migrations/0011_phase4_enterprise_orgs_and_teams.sql
-- GitBowl Phase 4: Enterprise Organizations, Teams, SSO & Audit Logging

-- 1. Organizations Table
CREATE TABLE IF NOT EXISTS public.orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  display_name text,
  description text DEFAULT '',
  avatar_url text,
  billing_email text,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'team', 'enterprise')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orgs_slug ON public.orgs(slug);

-- 2. Organization Members
CREATE TABLE IF NOT EXISTS public.org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'billing')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_org_member UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.org_members(org_id);

-- 3. Teams Table
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text DEFAULT '',
  privacy text NOT NULL DEFAULT 'visible' CHECK (privacy IN ('visible', 'secret')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_org_team_slug UNIQUE (org_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_teams_org ON public.teams(org_id);

-- 4. Team Members
CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('maintainer', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_team_member UNIQUE (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_team ON public.team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON public.team_members(user_id);

-- 5. Add org_id to repositories table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'repositories' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE public.repositories ADD COLUMN org_id uuid REFERENCES public.orgs(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_repositories_org ON public.repositories(org_id);
  END IF;
END $$;

-- 6. Team Repository Permissions
CREATE TABLE IF NOT EXISTS public.team_repo_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  repo_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  permission text NOT NULL DEFAULT 'read' CHECK (permission IN ('read', 'triage', 'write', 'maintain', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_team_repo UNIQUE (team_id, repo_id)
);

CREATE INDEX IF NOT EXISTS idx_team_repo_team ON public.team_repo_permissions(team_id);
CREATE INDEX IF NOT EXISTS idx_team_repo_repo ON public.team_repo_permissions(repo_id);

-- 7. Direct Repository Collaborators
CREATE TABLE IF NOT EXISTS public.repo_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission text NOT NULL DEFAULT 'write' CHECK (permission IN ('read', 'triage', 'write', 'maintain', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_repo_collaborator UNIQUE (repo_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_repo_collab_repo ON public.repo_collaborators(repo_id);
CREATE INDEX IF NOT EXISTS idx_repo_collab_user ON public.repo_collaborators(user_id);

-- 8. Organization SSO Configuration
CREATE TABLE IF NOT EXISTS public.org_sso_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE UNIQUE,
  provider text NOT NULL DEFAULT 'oidc' CHECK (provider IN ('saml', 'oidc', 'google_workspace')),
  issuer text,
  client_id text,
  sso_url text,
  certificate text,
  is_enforced boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 9. Enterprise Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.orgs(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ip_address text,
  user_agent text,
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON public.audit_logs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);

-- Enable RLS
ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_repo_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repo_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_sso_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view public org info" ON public.orgs
  FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "Org admins/owners can update org" ON public.orgs
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = orgs.id AND om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Anyone can view org members" ON public.org_members
  FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "Org admins/owners can manage members" ON public.org_members
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = org_members.org_id AND om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Org members can view teams" ON public.teams
  FOR SELECT TO authenticated
  USING (
    privacy = 'visible' OR EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = teams.org_id AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org admins can manage teams" ON public.teams
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = teams.org_id AND om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Team members can view team membership" ON public.team_members
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Org admins can manage team members" ON public.team_members
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      JOIN public.org_members om ON om.org_id = t.org_id
      WHERE t.id = team_members.team_id AND om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Org admins can view audit logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    org_id IS NULL OR EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = audit_logs.org_id AND om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "System can record audit logs" ON public.audit_logs
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

-- Realtime Publication
ALTER PUBLICATION supabase_realtime ADD TABLE orgs, org_members, teams, team_members, audit_logs;
