CREATE OR REPLACE FUNCTION public.can_view_repo(_repo_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.repositories r WHERE r.id = _repo_id AND (NOT r.is_private OR r.owner_id = auth.uid()))
$$;
CREATE OR REPLACE FUNCTION public.is_repo_owner(_repo_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.repositories r WHERE r.id = _repo_id AND r.owner_id = auth.uid())
$$;

CREATE TABLE public.issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  number int NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repo_id, number)
);
GRANT SELECT ON public.issues TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.issues TO authenticated;
GRANT ALL ON public.issues TO service_role;
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view issues" ON public.issues FOR SELECT USING (public.can_view_repo(repo_id));
CREATE POLICY "create issues" ON public.issues FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid() AND public.can_view_repo(repo_id));
CREATE POLICY "update issues" ON public.issues FOR UPDATE TO authenticated USING (author_id = auth.uid() OR public.is_repo_owner(repo_id));
CREATE POLICY "delete issues" ON public.issues FOR DELETE TO authenticated USING (public.is_repo_owner(repo_id));

CREATE OR REPLACE FUNCTION public.set_issue_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT COALESCE(MAX(number),0)+1 INTO NEW.number FROM public.issues WHERE repo_id = NEW.repo_id;
  RETURN NEW;
END $$;
CREATE TRIGGER issues_number BEFORE INSERT ON public.issues FOR EACH ROW EXECUTE FUNCTION public.set_issue_number();

CREATE TABLE public.issue_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.issue_comments TO anon;
GRANT SELECT, INSERT, DELETE ON public.issue_comments TO authenticated;
GRANT ALL ON public.issue_comments TO service_role;
ALTER TABLE public.issue_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view comments" ON public.issue_comments FOR SELECT USING (EXISTS (SELECT 1 FROM public.issues i WHERE i.id = issue_id AND public.can_view_repo(i.repo_id)));
CREATE POLICY "add comments" ON public.issue_comments FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid() AND EXISTS (SELECT 1 FROM public.issues i WHERE i.id = issue_id AND public.can_view_repo(i.repo_id)));
CREATE POLICY "delete own comments" ON public.issue_comments FOR DELETE TO authenticated USING (author_id = auth.uid());