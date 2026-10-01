ALTER TABLE public.repositories ADD COLUMN IF NOT EXISTS head_sha text;
CREATE TABLE public.git_objects (
  repo_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  sha text NOT NULL,
  type text NOT NULL,
  data text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (repo_id, sha)
);
GRANT ALL ON public.git_objects TO service_role;
ALTER TABLE public.git_objects ENABLE ROW LEVEL SECURITY;