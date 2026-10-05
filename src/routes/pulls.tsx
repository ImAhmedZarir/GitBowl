// src/routes/pulls.tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GitPullRequest, Search, CheckCircle2, GitMerge, Clock } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/pulls")({
  head: () => ({
    meta: [
      { title: "Pull Requests — GitBowl" },
      { name: "description", content: "Review and manage your pull requests on GitBowl." },
    ],
  }),
  component: PullsPage,
});

function PullsPage() {
  const { user } = useAuth();
  const [filterState, setFilterState] = useState<"open" | "closed" | "all">("open");
  const [search, setSearch] = useState("");

  const { data: prs, isLoading } = useQuery({
    queryKey: ["global-prs", filterState, search],
    queryFn: async () => {
      let query = supabase
        .from("pull_requests" as any)
        .select(
          "id, number, title, state, source_branch, target_branch, created_at, merged_at, repositories(name, is_private, profiles!repositories_owner_id_fkey(username)), profiles!pull_requests_author_id_fkey(username, display_name)",
        )
        .order("created_at", { ascending: false })
        .limit(50);

      if (filterState !== "all") {
        query = query.eq("state", filterState);
      }

      if (search.trim()) {
        query = query.ilike("title", `%${search.trim()}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as any[]) || [];
    },
    staleTime: 1000 * 15,
  });

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between">
      <Header />
      <main className="mx-auto w-full max-w-7xl px-4 py-8 flex-1">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-border">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Pull Requests</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review code contributions and merge incoming branches.
            </p>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 p-1 bg-muted/50 rounded-lg border border-border/80">
            <Button
              size="sm"
              variant={filterState === "open" ? "secondary" : "ghost"}
              className="text-xs h-7"
              onClick={() => setFilterState("open")}
            >
              <GitPullRequest className="h-3.5 w-3.5 mr-1.5 text-emerald-500" />
              Open
            </Button>
            <Button
              size="sm"
              variant={filterState === "closed" ? "secondary" : "ghost"}
              className="text-xs h-7"
              onClick={() => setFilterState("closed")}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-purple-500" />
              Closed / Merged
            </Button>
            <Button
              size="sm"
              variant={filterState === "all" ? "secondary" : "ghost"}
              className="text-xs h-7"
              onClick={() => setFilterState("all")}
            >
              All
            </Button>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Filter pull requests..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 text-xs bg-card"
            />
          </div>
        </div>

        {/* PR List */}
        <div className="mt-4 rounded-xl border border-border bg-card divide-y divide-border/60 text-xs shadow-xs">
          {isLoading && (
            <div className="p-8 text-center text-muted-foreground">Loading pull requests...</div>
          )}

          {!isLoading &&
            prs &&
            prs.length > 0 &&
            prs.map((pr: any) => {
              const repoOwner = pr.repositories?.profiles?.username || "owner";
              const repoName = pr.repositories?.name || "repo";

              return (
                <div
                  key={pr.id}
                  className="p-4 flex items-start justify-between gap-4 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    {pr.state === "open" ? (
                      <GitPullRequest className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    ) : pr.state === "merged" ? (
                      <GitMerge className="h-4 w-4 text-purple-500 mt-0.5 shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-neutral-400 mt-0.5 shrink-0" />
                    )}

                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          to="/$owner/$repo"
                          params={{ owner: repoOwner, repo: repoName }}
                          search={{ tab: "code" }}
                          className="font-medium text-muted-foreground hover:text-foreground"
                        >
                          {repoOwner}/{repoName}
                        </Link>
                        <span className="text-muted-foreground font-mono">#{pr.number}</span>
                        <span className="font-semibold text-foreground text-sm">{pr.title}</span>
                      </div>

                      <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2">
                        <span>by {pr.profiles?.username || "author"}</span>
                        <span>•</span>
                        <span className="font-mono bg-muted/60 px-1.5 py-0.5 rounded text-[10px]">
                          {pr.source_branch} → {pr.target_branch}
                        </span>
                        <span>•</span>
                        <span>{new Date(pr.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <Badge
                    variant="outline"
                    className={`text-[10px] capitalize shrink-0 ${
                      pr.state === "open"
                        ? "border-emerald-600/30 text-emerald-500 bg-emerald-500/10"
                        : pr.state === "merged"
                          ? "border-purple-600/30 text-purple-400 bg-purple-500/10"
                          : "border-border text-muted-foreground"
                    }`}
                  >
                    {pr.state}
                  </Badge>
                </div>
              );
            })}

          {!isLoading && (!prs || prs.length === 0) && (
            <div className="p-12 text-center text-muted-foreground">
              <GitPullRequest className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
              <h2 className="text-sm font-semibold text-foreground">No pull requests found</h2>
              <p className="mt-1 max-w-md mx-auto leading-relaxed">
                There aren&apos;t any {filterState !== "all" ? filterState : ""} pull requests
                matching your search.
              </p>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
