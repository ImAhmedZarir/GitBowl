// src/routes/search.tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search as SearchIcon,
  FolderGit2,
  Code2,
  CircleDot,
  Users,
  Star,
  GitFork,
  FileText,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type SearchScope = "repositories" | "code" | "issues" | "users";

export const Route = createFileRoute("/search")({
  validateSearch: (
    s: Record<string, unknown>,
  ): { q?: string | undefined; type?: string | undefined } => ({
    q: typeof s["q"] === "string" ? s["q"] : undefined,
    type: typeof s["type"] === "string" ? s["type"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Search — GitBowl" },
      { name: "description", content: "Search repositories, code, issues, and users on GitBowl." },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const { q = "", type = "repositories" } = Route.useSearch();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState(q);
  const activeScope: SearchScope = ["repositories", "code", "issues", "users"].includes(type)
    ? (type as SearchScope)
    : "repositories";

  useEffect(() => {
    setSearchTerm(q);
  }, [q]);

  const { data, isLoading } = useQuery({
    queryKey: ["search-results", q, activeScope],
    queryFn: async () => {
      if (!q.trim()) return { results: [], count: 0 };
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=${activeScope}`);
      if (!res.ok) throw new Error("Search failed");
      return await res.json();
    },
    enabled: !!q.trim(),
  });

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    navigate({
      to: "/search",
      search: { q: searchTerm.trim(), type: activeScope },
    });
  }

  function handleScopeChange(newScope: SearchScope) {
    navigate({
      to: "/search",
      search: { q: searchTerm.trim() || q, type: newScope },
    });
  }

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between">
      <Header />
      <main className="mx-auto w-full max-w-7xl px-4 py-8 flex-1">
        {/* Search Header */}
        <form onSubmit={handleSearchSubmit} className="max-w-3xl mx-auto mb-8">
          <div className="relative flex items-center">
            <SearchIcon className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search across all of GitBowl (repositories, code, issues, users)..."
              className="pl-10 pr-24 h-10 text-sm bg-card"
            />
            <Button
              type="submit"
              size="sm"
              className="absolute right-1.5 h-7 text-xs bg-emerald-600 hover:bg-emerald-500"
            >
              Search
            </Button>
          </div>
        </form>

        <div className="flex flex-col md:flex-row gap-8">
          {/* Scope Sidebar */}
          <aside className="w-full md:w-56 shrink-0 space-y-1">
            <button
              onClick={() => handleScopeChange("repositories")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeScope === "repositories"
                  ? "bg-accent text-accent-foreground font-semibold"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <span className="flex items-center gap-2">
                <FolderGit2 className="h-4 w-4" />
                Repositories
              </span>
            </button>
            <button
              onClick={() => handleScopeChange("code")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeScope === "code"
                  ? "bg-accent text-accent-foreground font-semibold"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <span className="flex items-center gap-2">
                <Code2 className="h-4 w-4" />
                Code
              </span>
            </button>
            <button
              onClick={() => handleScopeChange("issues")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeScope === "issues"
                  ? "bg-accent text-accent-foreground font-semibold"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <span className="flex items-center gap-2">
                <CircleDot className="h-4 w-4" />
                Issues
              </span>
            </button>
            <button
              onClick={() => handleScopeChange("users")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeScope === "users"
                  ? "bg-accent text-accent-foreground font-semibold"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Users
              </span>
            </button>
          </aside>

          {/* Results Area */}
          <section className="flex-1 min-w-0">
            {isLoading && (
              <div className="p-12 text-center text-xs text-muted-foreground">
                Searching across {activeScope}...
              </div>
            )}

            {!isLoading && data?.results && (
              <div className="space-y-4">
                <div className="text-xs text-muted-foreground pb-2 border-b border-border">
                  Found {data.count || 0} result(s) for &ldquo;{q}&rdquo;
                </div>

                {/* 1. Repositories Results */}
                {activeScope === "repositories" && (
                  <div className="divide-y divide-border rounded-xl border border-border bg-card">
                    {data.results.map((r: any) => (
                      <div key={r.id} className="p-4 hover:bg-muted/20 transition-colors">
                        <Link
                          to="/$owner/$repo"
                          params={{ owner: r.owner || "owner", repo: r.name }}
                          search={{ tab: "code" }}
                          className="font-semibold text-emerald-500 hover:underline text-sm"
                        >
                          {r.owner} / {r.name}
                        </Link>
                        {r.description && (
                          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                            {r.description}
                          </p>
                        )}
                        <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground font-mono">
                          <span className="flex items-center gap-1">
                            <Star className="h-3 w-3" /> {r.stars}
                          </span>
                          <span className="flex items-center gap-1">
                            <GitFork className="h-3 w-3" /> {r.forks}
                          </span>
                          <span>Updated {new Date(r.updatedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 2. Code Results */}
                {activeScope === "code" && (
                  <div className="divide-y divide-border rounded-xl border border-border bg-card">
                    {data.results.map((f: any) => (
                      <div key={f.id} className="p-4 space-y-2 hover:bg-muted/20 transition-colors">
                        <div className="flex items-center gap-2 text-xs">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          <Link
                            to="/$owner/$repo"
                            params={{ owner: f.owner || "owner", repo: f.repoName }}
                            search={{ tab: "code" }}
                            className="font-medium text-emerald-500 hover:underline"
                          >
                            {f.owner}/{f.repoName}
                          </Link>
                          <span className="text-muted-foreground">/</span>
                          <span className="font-mono text-foreground font-semibold">{f.path}</span>
                        </div>
                        {f.snippet && (
                          <pre className="p-2.5 rounded bg-muted/60 font-mono text-[11px] text-muted-foreground overflow-x-auto whitespace-pre-wrap">
                            {f.snippet}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* 3. Issues Results */}
                {activeScope === "issues" && (
                  <div className="divide-y divide-border rounded-xl border border-border bg-card">
                    {data.results.map((i: any) => (
                      <div
                        key={i.id}
                        className="p-4 flex items-start gap-3 hover:bg-muted/20 transition-colors"
                      >
                        <CircleDot className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                        <div>
                          <div className="flex items-center gap-2 text-xs">
                            <Link
                              to="/$owner/$repo"
                              params={{ owner: i.owner || "owner", repo: i.repoName }}
                              search={{ tab: "issues" }}
                              className="font-semibold text-foreground text-sm hover:underline"
                            >
                              {i.title}
                            </Link>
                            <span className="text-muted-foreground font-mono">#{i.number}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            in {i.owner}/{i.repoName} • opened{" "}
                            {new Date(i.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 4. Users Results */}
                {activeScope === "users" && (
                  <div className="divide-y divide-border rounded-xl border border-border bg-card">
                    {data.results.map((u: any) => (
                      <div
                        key={u.id}
                        className="p-4 flex items-center justify-between hover:bg-muted/20 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600/20 text-emerald-400 font-bold text-sm">
                            {u.username.slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <Link
                              to="/$owner"
                              params={{ owner: u.username }}
                              className="font-semibold text-sm text-foreground hover:underline"
                            >
                              {u.username}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {u.display_name || u.bio || "GitBowl user"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {data.results.length === 0 && (
                  <div className="p-12 text-center text-xs text-muted-foreground rounded-xl border border-border bg-card">
                    <SearchIcon className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
                    <p className="font-semibold text-foreground">
                      We couldn&apos;t find any {activeScope} matching &ldquo;{q}&rdquo;
                    </p>
                    <p className="mt-1">
                      Try refining your search term or selecting another category.
                    </p>
                  </div>
                )}
              </div>
            )}

            {!isLoading && !q.trim() && (
              <div className="p-16 text-center text-xs text-muted-foreground rounded-xl border border-border bg-card">
                <SearchIcon className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
                <h3 className="text-sm font-semibold text-foreground">Explore GitBowl</h3>
                <p className="mt-1 max-w-sm mx-auto">
                  Type a repository name, code keyword, or user handle in the search bar above to
                  begin.
                </p>
              </div>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
