import { Link } from "@tanstack/react-router";
import { GitFork, Lock, Star } from "lucide-react";

export const LANGUAGE_COLORS: Record<string, string> = {
  Python: "#3572A5",
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  HTML: "#e34c26",
  CSS: "#563d7c",
  PHP: "#4F5D95",
  Ruby: "#701516",
  Go: "#00ADD8",
  Rust: "#dea584",
  Java: "#b07219",
  "C++": "#f34b7d",
  C: "#555555",
  "C#": "#178600",
  Shell: "#89e051",
  Kotlin: "#A97BFF",
  Swift: "#F05138",
  Dart: "#00B4AB",
};

export type RepoRow = {
  id?: string;
  name: string;
  description?: string | null;
  is_private?: boolean;
  isPrivate?: boolean;
  stars_count?: number;
  starsCount?: number;
  forks_count?: number;
  forksCount?: number;
  updated_at?: string;
  updatedAt?: string;
  created_at?: string;
  forked_from?: string | null;
  language?: string | null;
  owner?: string;
  profiles?: { username: string; display_name?: string } | null;
};

export function RepoCard({ repo, owner }: { repo: RepoRow; owner?: string }) {
  const ownerName = owner || repo.owner || repo.profiles?.username || "developer";

  const isPrivate = repo.is_private ?? repo.isPrivate ?? false;
  const starsCount = repo.stars_count ?? repo.starsCount ?? 0;
  const forksCount = repo.forks_count ?? repo.forksCount ?? 0;
  const rawDate = repo.updated_at || repo.updatedAt || repo.created_at;

  // Detect language from repo name / description or fallback
  const lang =
    repo.language ||
    (repo.name.toLowerCase().includes("python") ||
    (repo.description && /python/i.test(repo.description))
      ? "Python"
      : repo.name.toLowerCase().includes("react") || repo.name.toLowerCase().includes("js")
        ? "JavaScript"
        : repo.name.toLowerCase().includes("ts")
          ? "TypeScript"
          : repo.name.toLowerCase().includes("php")
            ? "PHP"
            : null);

  const langColor = lang ? LANGUAGE_COLORS[lang] || "#3178c6" : null;

  function formatDate(d?: string) {
    if (!d) return "Recently";
    try {
      const parsed = new Date(d);
      if (isNaN(parsed.getTime())) return "Recently";
      return parsed.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: parsed.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
      });
    } catch {
      return "Recently";
    }
  }

  return (
    <div className="flex flex-col justify-between rounded-lg border border-border/80 bg-card p-4 transition-all duration-150 hover:border-border hover:shadow-xs">
      <div>
        <div className="flex items-start justify-between gap-2">
          <Link
            to="/$owner/$repo"
            params={{ owner: ownerName, repo: repo.name }}
            className="text-sm font-semibold text-primary hover:underline truncate"
          >
            {owner ? repo.name : `${ownerName}/${repo.name}`}
          </Link>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/80 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {isPrivate ? (
              <>
                <Lock className="h-3 w-3" /> Private
              </>
            ) : (
              "Public"
            )}
          </span>
        </div>

        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground leading-relaxed">
          {repo.description || "No description provided."}
        </p>
      </div>

      <div className="mt-4 flex items-center gap-4 text-[11px] text-muted-foreground">
        {lang && (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: langColor || "#3178c6" }}
            />
            <span>{lang}</span>
          </span>
        )}

        <span className="inline-flex items-center gap-1">
          <Star className="h-3.5 w-3.5" />
          <span>{starsCount}</span>
        </span>

        {forksCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <GitFork className="h-3.5 w-3.5" />
            <span>{forksCount}</span>
          </span>
        )}

        <span className="ml-auto">Updated {formatDate(rawDate)}</span>
      </div>
    </div>
  );
}
