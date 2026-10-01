-- Migration 0006: Atomic RPCs and Data Integrity

-- Add storage_path and sha columns to repo_files for object storage support
ALTER TABLE public.repo_files ADD COLUMN IF NOT EXISTS storage_path text NULL;
ALTER TABLE public.repo_files ADD COLUMN IF NOT EXISTS sha text NULL;

-- 1. Atomic Fork Repository RPC
CREATE OR REPLACE FUNCTION public.fork_repository(
  p_source_repo_id uuid,
  p_new_owner_id uuid,
  p_new_name text,
  p_description text DEFAULT NULL,
  p_is_fork boolean DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_repo_id uuid;
BEGIN
  -- Insert target repository
  INSERT INTO public.repositories (
    owner_id,
    name,
    description,
    forked_from,
    created_at,
    updated_at
  ) VALUES (
    p_new_owner_id,
    p_new_name,
    p_description,
    CASE WHEN p_is_fork THEN p_source_repo_id ELSE NULL END,
    now(),
    now()
  ) RETURNING id INTO v_new_repo_id;

  -- Atomic bulk copy of all files in a single SQL operation
  INSERT INTO public.repo_files (
    repo_id,
    path,
    content,
    is_binary,
    size,
    storage_path,
    sha,
    updated_at
  )
  SELECT
    v_new_repo_id,
    path,
    content,
    is_binary,
    size,
    storage_path,
    sha,
    now()
  FROM public.repo_files
  WHERE repo_id = p_source_repo_id;

  -- Increment fork count on source repo if this is a fork
  IF p_is_fork THEN
    UPDATE public.repositories
    SET forks_count = coalesce(forks_count, 0) + 1,
        updated_at = now()
    WHERE id = p_source_repo_id;
  END IF;

  RETURN v_new_repo_id;
END;
$$;

-- 2. Atomic Commit Changes RPC
CREATE OR REPLACE FUNCTION public.commit_changes(
  p_repo_id uuid,
  p_author_id uuid,
  p_message text,
  p_upserts jsonb DEFAULT '[]'::jsonb,
  p_deletes text[] DEFAULT '{}'::text[],
  p_expected_head text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_commit_id uuid;
  v_current_head text;
  v_rec record;
BEGIN
  -- Optimistic lock check if expected head SHA is provided
  IF p_expected_head IS NOT NULL AND p_expected_head <> '' THEN
    SELECT head_sha INTO v_current_head FROM public.repositories WHERE id = p_repo_id;
    IF v_current_head IS NOT NULL AND v_current_head <> p_expected_head THEN
      RAISE EXCEPTION 'Branch tip has changed (concurrent commit detected). Please refresh.';
    END IF;
  END IF;

  -- Apply file deletions
  IF array_length(p_deletes, 1) > 0 THEN
    DELETE FROM public.repo_files
    WHERE repo_id = p_repo_id
      AND path = ANY(p_deletes);
  END IF;

  -- Apply file upserts from JSON array
  FOR v_rec IN SELECT * FROM jsonb_to_recordset(p_upserts) AS x(
    path text,
    content text,
    is_binary boolean,
    size integer,
    storage_path text,
    sha text
  )
  LOOP
    INSERT INTO public.repo_files (
      repo_id,
      path,
      content,
      is_binary,
      size,
      storage_path,
      sha,
      updated_at
    ) VALUES (
      p_repo_id,
      v_rec.path,
      v_rec.content,
      coalesce(v_rec.is_binary, false),
      coalesce(v_rec.size, length(v_rec.content)),
      v_rec.storage_path,
      v_rec.sha,
      now()
    )
    ON CONFLICT (repo_id, path) DO UPDATE SET
      content = EXCLUDED.content,
      is_binary = EXCLUDED.is_binary,
      size = EXCLUDED.size,
      storage_path = EXCLUDED.storage_path,
      sha = EXCLUDED.sha,
      updated_at = now();
  END LOOP;

  -- Insert commit row
  INSERT INTO public.commits (
    repo_id,
    author_id,
    message,
    created_at
  ) VALUES (
    p_repo_id,
    p_author_id,
    p_message,
    now()
  ) RETURNING id INTO v_commit_id;

  -- Update repository timestamp
  UPDATE public.repositories
  SET updated_at = now()
  WHERE id = p_repo_id;

  RETURN v_commit_id;
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.fork_repository TO authenticated;
GRANT EXECUTE ON FUNCTION public.fork_repository TO service_role;

GRANT EXECUTE ON FUNCTION public.commit_changes TO authenticated;
GRANT EXECUTE ON FUNCTION public.commit_changes TO service_role;
