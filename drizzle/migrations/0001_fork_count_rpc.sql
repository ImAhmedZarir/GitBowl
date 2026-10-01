CREATE OR REPLACE FUNCTION public.increment_fork_count(_repo_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.repositories SET forks_count = forks_count + 1 WHERE id = _repo_id;
$$;
GRANT EXECUTE ON FUNCTION public.increment_fork_count(uuid) TO authenticated;