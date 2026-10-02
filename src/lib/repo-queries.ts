import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RepoMetadata {
  id: string;
  name: string;
  description: string | null;
  is_private: boolean;
  default_branch: string;
  forked_from: string | null;
  stars_count: number;
  forks_count: number;
  created_at: string;
  updated_at: string;
  head_sha?: string;
  owner_id: string;
  profiles: {
    id: string;
    username: string;
    display_name: string | null;
  };
}

export interface RepoFileMeta {
  id: string;
  repo_id: string;
  path: string;
  is_binary: boolean;
  size: number;
  updated_at: string;
}

export const repoQueryOptions = (owner: string, repoName: string) =>
  queryOptions({
    queryKey: ["repo-metadata", owner.toLowerCase(), repoName],
    queryFn: async () => {
      try {
        const cleanOwner = (owner || "").trim().toLowerCase();
        const { data, error } = await supabase
          .from("repositories")
          .select("*, profiles!repositories_owner_id_fkey!inner(id, username, display_name)")
          .eq("name", repoName)
          .ilike("profiles.username", cleanOwner)
          .maybeSingle();

        if (error) {
          console.warn("Repo fetch warning:", error);
          return null;
        }
        return (data as unknown as RepoMetadata) ?? null;
      } catch (e) {
        console.warn("Repo fetch exception:", e);
        return null;
      }
    },
    staleTime: 1000 * 60, // 60 seconds
  });

export const repoFilesMetaQueryOptions = (repoId: string | undefined) =>
  queryOptions({
    queryKey: ["repo-files-meta", repoId],
    enabled: !!repoId,
    queryFn: async () => {
      if (!repoId) return [];
      try {
        const { data, error } = await supabase
          .from("repo_files")
          .select("id, repo_id, path, is_binary, size, updated_at")
          .eq("repo_id", repoId)
          .order("path", { ascending: true });

        if (error) {
          console.warn("Files meta fetch error:", error);
          return [];
        }
        return (data as unknown as RepoFileMeta[]) ?? [];
      } catch {
        return [];
      }
    },
    staleTime: 1000 * 60,
  });

export async function fetchFileContent(repoId: string, path: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("repo_files")
      .select("content, is_binary")
      .eq("repo_id", repoId)
      .eq("path", path)
      .maybeSingle();

    if (error || !data) {
      return "";
    }
    return data.content || "";
  } catch {
    return "";
  }
}
