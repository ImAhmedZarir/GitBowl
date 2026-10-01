import { Link } from "@tanstack/react-router";
import { GitFork, Lock, Star } from "lucide-react";

type RepoRow = {
  id: string;
  name: string;
  description: string | null;
  is_private: boolean;
  stars_count: number;
  forks_count: number;
  updated_at: string;
  forked_from?: string | null;
  profiles?: { username: string } | null;
};

export function RepoCard({ repo, owner }: { repo: RepoRow; owner?: string }) {
  const ownerName = owner ?? repo.profiles?.username ?? "";

  return (
    <div className="panel flex flex-col gap-2 p-4 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-2">
        <Link
          to="/$owner/$repo"
          params={{ owner: ownerName, repo: repo.name }}
          className="font-semibold text-primary hover:underline"
        >
          {ownerName ? `${ownerName}/` : ""}
          {repo.name}
        </Link>
        {repo.is_private ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3" /> Private
          </span>
        ) : null}
      </div>
      <p className="line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
        {repo.description || "No description provided."}
      </p>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Star className="h-3.5 w-3.5" /> {repo.stars_count}
        </span>
        <span className="inline-flex items-center gap-1">
          <GitFork className="h-3.5 w-3.5" /> {repo.forks_count}
        </span>
        <span>Updated {new Date(repo.updated_at).toLocaleDateString()}</span>
      </div>
    </div>
  );
}
