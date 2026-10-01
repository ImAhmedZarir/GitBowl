import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CircleDot, CircleCheck, Search, Filter } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/issues")({
  head: () => ({
    meta: [
      { title: "Issues — GitBowl" },
      { name: "description", content: "View and track your GitBowl issues across repositories." },
    ],
  }),
  component: IssuesPage,
});

function IssuesPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<"open" | "closed">("open");
  const [query, setQuery] = useState("");

  const { data: issues = [], isLoading } = useQuery({
    queryKey: ["global-issues", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("issues")
        .select(
          "id, title, state, created_at, repo_id, repositories(name, profiles!repositories_owner_id_fkey(username))",
        )
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) {
        console.warn("Could not load global issues:", error);
        return [];
      }
      return data ?? [];
    },
    staleTime: 1000 * 30,
  });

  const filtered = issues.filter((i: any) => {
    const matchesState = i.state === filter;
    const matchesQuery = !query.trim() || i.title.toLowerCase().includes(query.toLowerCase());
    return matchesState && matchesQuery;
  });

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between">
      <Header />
      <main className="mx-auto w-full max-w-7xl px-4 py-8 flex-1">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-border">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Issues</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Track bugs, feature requests, and discussions across your repositories.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Filter issues..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 pl-8 text-xs bg-muted/30"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-border bg-card overflow-hidden shadow-xs">
          {/* Header filter bar */}
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5 text-xs">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setFilter("open")}
                className={`flex items-center gap-1.5 font-medium transition-colors ${
                  filter === "open"
                    ? "text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <CircleDot className="h-3.5 w-3.5 text-success" />
                <span>Open</span>
              </button>
              <button
                type="button"
                onClick={() => setFilter("closed")}
                className={`flex items-center gap-1.5 font-medium transition-colors ${
                  filter === "closed"
                    ? "text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <CircleCheck className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Closed</span>
              </button>
            </div>
          </div>

          {/* Issues list */}
          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 p-4 animate-pulse bg-card" />
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <div className="divide-y divide-border">
              {filtered.map((issue: any) => {
                const owner = issue.repositories?.profiles?.username || "unknown";
                const repoName = issue.repositories?.name || "repo";
                return (
                  <div
                    key={issue.id}
                    className="flex items-start gap-3 p-4 hover:bg-muted/30 transition-colors"
                  >
                    <CircleDot className="h-4 w-4 text-success shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link
                          to="/$owner/$repo"
                          params={{ owner, repo: repoName }}
                          search={{ tab: "issues" }}
                          className="font-semibold text-xs text-foreground hover:underline"
                        >
                          {issue.title}
                        </Link>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        in{" "}
                        <span className="font-medium text-foreground">
                          {owner}/{repoName}
                        </span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-12 text-center text-muted-foreground text-xs">
              <CircleDot className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="font-semibold text-foreground">No {filter} issues found</p>
              <p className="mt-1">
                When issues are opened on repositories you follow or contribute to, they appear
                here.
              </p>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
