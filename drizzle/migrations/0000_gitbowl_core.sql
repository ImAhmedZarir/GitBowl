-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  display_name text,
  bio text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles are public" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE base text; candidate text; n int := 0;
BEGIN
  base := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)), '[^a-zA-Z0-9_-]', '', 'g'));
  IF base = '' OR base IS NULL THEN base := 'user'; END IF;
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = candidate) LOOP
    n := n + 1; candidate := base || n::text;
  END LOOP;
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (new.id, candidate, coalesce(new.raw_user_meta_data->>'display_name', candidate));
  RETURN new;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- REPOSITORIES
CREATE TABLE public.repositories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_private boolean NOT NULL DEFAULT false,
  default_branch text NOT NULL DEFAULT 'main',
  forked_from uuid REFERENCES public.repositories(id) ON DELETE SET NULL,
  stars_count integer NOT NULL DEFAULT 0,
  forks_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, name)
);
GRANT SELECT ON public.repositories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repositories TO authenticated;
GRANT ALL ON public.repositories TO service_role;
ALTER TABLE public.repositories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public repos readable" ON public.repositories FOR SELECT USING (is_private = false OR auth.uid() = owner_id);
CREATE POLICY "own repo insert" ON public.repositories FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "own repo update" ON public.repositories FOR UPDATE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "own repo delete" ON public.repositories FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- FILES
CREATE TABLE public.repo_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  path text NOT NULL,
  content text NOT NULL DEFAULT '',
  is_binary boolean NOT NULL DEFAULT false,
  size integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repo_id, path)
);
CREATE INDEX repo_files_repo_idx ON public.repo_files(repo_id);
GRANT SELECT ON public.repo_files TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repo_files TO authenticated;
GRANT ALL ON public.repo_files TO service_role;
ALTER TABLE public.repo_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "files of visible repos" ON public.repo_files FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.repositories r WHERE r.id = repo_id AND (r.is_private = false OR r.owner_id = auth.uid())));
CREATE POLICY "files write by owner" ON public.repo_files FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.repositories r WHERE r.id = repo_id AND r.owner_id = auth.uid()));
CREATE POLICY "files update by owner" ON public.repo_files FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.repositories r WHERE r.id = repo_id AND r.owner_id = auth.uid()));
CREATE POLICY "files delete by owner" ON public.repo_files FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.repositories r WHERE r.id = repo_id AND r.owner_id = auth.uid()));

-- COMMITS
CREATE TABLE public.commits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  message text NOT NULL,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commits_repo_idx ON public.commits(repo_id, created_at DESC);
GRANT SELECT ON public.commits TO anon;
GRANT SELECT, INSERT ON public.commits TO authenticated;
GRANT ALL ON public.commits TO service_role;
ALTER TABLE public.commits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commits of visible repos" ON public.commits FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.repositories r WHERE r.id = repo_id AND (r.is_private = false OR r.owner_id = auth.uid())));
CREATE POLICY "commits insert by owner" ON public.commits FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id AND EXISTS (SELECT 1 FROM public.repositories r WHERE r.id = repo_id AND r.owner_id = auth.uid()));

-- STARS
CREATE TABLE public.stars (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  repo_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, repo_id)
);
GRANT SELECT ON public.stars TO anon;
GRANT SELECT, INSERT, DELETE ON public.stars TO authenticated;
GRANT ALL ON public.stars TO service_role;
ALTER TABLE public.stars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stars readable" ON public.stars FOR SELECT USING (true);
CREATE POLICY "star self" ON public.stars FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "unstar self" ON public.stars FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.sync_star_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.repositories SET stars_count = stars_count + 1 WHERE id = new.repo_id;
    RETURN new;
  ELSE
    UPDATE public.repositories SET stars_count = GREATEST(stars_count - 1, 0) WHERE id = old.repo_id;
    RETURN old;
  END IF;
END; $$;
CREATE TRIGGER stars_count_trigger AFTER INSERT OR DELETE ON public.stars
FOR EACH ROW EXECUTE FUNCTION public.sync_star_count();