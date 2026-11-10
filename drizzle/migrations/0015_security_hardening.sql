-- drizzle/migrations/0015_security_hardening.sql
-- Comprehensive Security Hardening: RLS Lockdown, Function Search Paths, Disjoint Namespaces & Realtime Strip

-- ============================================================================
-- 1. SECURE SEARCH_PATH ON ALL SECURITY DEFINER FUNCTIONS
-- ============================================================================
-- Prevent search_path hijacking vulnerabilities in PostgreSQL

DO $$
BEGIN
  -- protect_profile_roles
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'protect_profile_roles') THEN
    ALTER FUNCTION public.protect_profile_roles() SET search_path = public, pg_temp;
  END IF;

  -- search_code_safe
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'search_code_safe') THEN
    ALTER FUNCTION public.search_code_safe(text, uuid, integer) SET search_path = public, pg_temp;
    REVOKE EXECUTE ON FUNCTION public.search_code_safe(text, uuid, integer) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.search_code_safe(text, uuid, integer) TO service_role;
  END IF;

  -- notify_user
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'notify_user') THEN
    ALTER FUNCTION public.notify_user SET search_path = public, pg_temp;
    REVOKE EXECUTE ON FUNCTION public.notify_user FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.notify_user TO service_role;
  END IF;

  -- increment_fork_count
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'increment_fork_count') THEN
    ALTER FUNCTION public.increment_fork_count SET search_path = public, pg_temp;
    REVOKE EXECUTE ON FUNCTION public.increment_fork_count FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.increment_fork_count TO service_role;
  END IF;

  -- commit_changes (if exists)
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'commit_changes') THEN
    ALTER FUNCTION public.commit_changes SET search_path = public, pg_temp;
    REVOKE EXECUTE ON FUNCTION public.commit_changes FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.commit_changes TO service_role;
  END IF;
END $$;

-- ============================================================================
-- 2. DISJOINT NAMESPACE ENFORCEMENT (PROFILES.USERNAME <-> ORGS.SLUG)
-- ============================================================================
-- Prevent URL routing confusion and account impersonation at the DB level

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_lower_username ON public.profiles (lower(trim(username)));
CREATE UNIQUE INDEX IF NOT EXISTS idx_orgs_lower_slug ON public.orgs (lower(trim(slug)));

CREATE OR REPLACE FUNCTION public.check_namespace_disjoint_profile()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.orgs WHERE lower(trim(slug)) = lower(trim(NEW.username))
  ) THEN
    RAISE EXCEPTION 'Username "%" collides with an existing organization slug', NEW.username;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_check_namespace_profile ON public.profiles;
CREATE TRIGGER trg_check_namespace_profile
  BEFORE INSERT OR UPDATE OF username ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.check_namespace_disjoint_profile();

CREATE OR REPLACE FUNCTION public.check_namespace_disjoint_org()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles WHERE lower(trim(username)) = lower(trim(NEW.slug))
  ) THEN
    RAISE EXCEPTION 'Organization slug "%" collides with an existing username', NEW.slug;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_check_namespace_org ON public.orgs;
CREATE TRIGGER trg_check_namespace_org
  BEFORE INSERT OR UPDATE OF slug ON public.orgs
  FOR EACH ROW EXECUTE FUNCTION public.check_namespace_disjoint_org();

-- ============================================================================
-- 3. RLS LOCKDOWN & SENSITIVE TABLE ISOLATION
-- ============================================================================

-- A. lfs_data & lfs_objects: Only accessible via service_role / Smart-HTTP endpoints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lfs_data') THEN
    ALTER TABLE public.lfs_data ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public LFS Data Access" ON public.lfs_data;
    DROP POLICY IF EXISTS "Enable all access for users" ON public.lfs_data;
    REVOKE ALL ON public.lfs_data FROM PUBLIC, anon, authenticated;
    GRANT ALL ON public.lfs_data TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lfs_objects') THEN
    ALTER TABLE public.lfs_objects ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public LFS Objects Access" ON public.lfs_objects;
    DROP POLICY IF EXISTS "Enable all access for users" ON public.lfs_objects;
    REVOKE ALL ON public.lfs_objects FROM PUBLIC, anon, authenticated;
    GRANT ALL ON public.lfs_objects TO service_role;
  END IF;
END $$;

-- B. repo_github_sync: Sensitive token table - service_role ONLY
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'repo_github_sync') THEN
    ALTER TABLE public.repo_github_sync ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Enable all access for users" ON public.repo_github_sync;
    REVOKE ALL ON public.repo_github_sync FROM PUBLIC, anon, authenticated;
    GRANT ALL ON public.repo_github_sync TO service_role;
  END IF;
END $$;

-- C. Webhooks & Webhook Deliveries: service_role ONLY
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'webhook_deliveries') THEN
    ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Enable all access for users" ON public.webhook_deliveries;
    REVOKE ALL ON public.webhook_deliveries FROM PUBLIC, anon, authenticated;
    GRANT ALL ON public.webhook_deliveries TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'webhooks') THEN
    ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Enable all access for users" ON public.webhooks;
    REVOKE ALL ON public.webhooks FROM PUBLIC, anon, authenticated;
    GRANT ALL ON public.webhooks TO service_role;
  END IF;
END $$;

-- D. Audit Logs & Rate Limits: service_role ONLY
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
    ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Enable all access for users" ON public.audit_logs;
    REVOKE ALL ON public.audit_logs FROM PUBLIC, anon, authenticated;
    GRANT ALL ON public.audit_logs TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'api_rate_limits') THEN
    ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Enable all access for users" ON public.api_rate_limits;
    REVOKE ALL ON public.api_rate_limits FROM PUBLIC, anon, authenticated;
    GRANT ALL ON public.api_rate_limits TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rate_limits') THEN
    ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Enable all access for users" ON public.rate_limits;
    REVOKE ALL ON public.rate_limits FROM PUBLIC, anon, authenticated;
    GRANT ALL ON public.rate_limits TO service_role;
  END IF;
END $$;

-- ============================================================================
-- 4. REALTIME PUBLICATION LEAK PREVENTION
-- ============================================================================
-- Prevent accidental websocket broadcast of credentials or secret tokens

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.repo_github_sync;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.webhooks;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.webhook_deliveries;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.audit_logs;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.lfs_data;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END $$;

-- ============================================================================
-- 5. STORAGE BACKUPS INTEGRITY
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'storage_backups') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'storage_backups' AND column_name = 'updated_at'
    ) THEN
      ALTER TABLE public.storage_backups ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

    -- Add unique constraint on repo_id + sha to support idempotent sync jobs
    CREATE UNIQUE INDEX IF NOT EXISTS idx_storage_backups_repo_sha ON public.storage_backups (repo_id, sha);
  END IF;
END $$;
