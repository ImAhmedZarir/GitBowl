-- drizzle/migrations/0013_fix_admin_drive_and_notifications.sql
-- GitBowl: Real Notifications Engine, Admin Promotion, and Storage Synchronization

-- 1. Create Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL, -- 'star', 'fork', 'issue', 'pr', 'commit', 'sync', 'admin', 'system'
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  link text NOT NULL DEFAULT '/',
  is_read boolean NOT NULL DEFAULT false,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON public.notifications(user_id, created_at DESC);

-- Enable RLS on notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
CREATE POLICY "Users can read own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages notifications" ON public.notifications;
CREATE POLICY "Service role manages notifications"
  ON public.notifications FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. Ensure Role column exists on profiles and promote primary admin
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;

-- Promote ahmedzarir07@gmail.com and ahmedzarir to admin role
UPDATE public.profiles
SET role = 'admin'
WHERE username = 'ahmedzarir'
   OR id IN (
     SELECT id FROM auth.users WHERE lower(email) = 'ahmedzarir07@gmail.com'
   );

-- 3. Storage Backups Table confirmation
CREATE TABLE IF NOT EXISTS public.storage_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  sha text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  size bigint NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.storage_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin and service role read storage_backups" ON public.storage_backups;
CREATE POLICY "Admin and service role read storage_backups"
  ON public.storage_backups FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. Initial welcome notification generator function
CREATE OR REPLACE FUNCTION public.notify_user(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_content text DEFAULT '',
  p_link text DEFAULT '/',
  p_actor_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.notifications (user_id, type, title, content, link, actor_id)
  VALUES (p_user_id, p_type, p_title, p_content, p_link, p_actor_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
