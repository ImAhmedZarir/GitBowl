import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Code2,
  FileArchive,
  FolderTree,
  GitFork,
  Star,
  Download,
  GitCommitHorizontal,
  Terminal as TerminalIcon,
  ShieldCheck,
  Search,
  Plus,
  BookMarked,
  Lock,
  Globe,
  ArrowRight,
  Flame,
  CheckCircle2,
  GitBranch,
  KeyRound,
  Users,
  Compass,
  FileCode,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/AppShell";
import { RepoCard } from "@/components/RepoCard";
import { RepoCardSkeleton, FeedItemSkeleton } from "@/components/Skeletons";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GitBowl — Your code, in a bowl." },
      {
        name: "description",
        content:
          "Create repositories, upload a zip, edit in a real code editor, commit, fork, star and share. GitBowl is code hosting without the setup.",
      },
      { property: "og:title", content: "GitBowl — Your code, in a bowl." },
      {
        property: "og:description",
        content: "Repositories, commits, forks, stars, zip import and a built-in code editor.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { user } = useAuth();

  return <AppShell>{user ? <DashboardView /> : <LandingView />}</AppShell>;
}

/* -------------------------------------------------------------------------- */
/*                            LOGGED IN DASHBOARD                             */
/* -------------------------------------------------------------------------- */

function DashboardView() {
  const { user, profile } = useAuth();
  const [repoFilter, setRepoFilter] = useState("");
  const [feedTab, setFeedTab] = useState<"all" | "pushes" | "starred">("all");

  // User's own repositories
  const { data: myRepos, isLoading: loadingMyRepos } = useQuery({
    queryKey: ["dashboard-my-repos", user?.id],
    queryFn: async () => {
      if (!user) return [];
      try {
        const { data, error } = await supabase
          .from("repositories")
          .select("*, profiles!repositories_owner_id_fkey(username)")
          .eq("owner_id", user.id)
          .order("updated_at", { ascending: false });
        if (error) {
          console.warn("Could not load user repos:", error.message);
          return [];
        }
        return data ?? [];
      } catch (err) {
        console.warn("User repos error:", err);
        return [];
      }
    },
    enabled: !!user,
    retry: false,
  });

  // Recent activity (commits across repositories)
  const { data: recentCommits, isLoading: loadingCommits } = useQuery({
    queryKey: ["dashboard-activity-feed"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("commits")
          .select(
            "id, message, created_at, repositories(id, name, is_private, profiles!repositories_owner_id_fkey(username))",
          )
          .order("created_at", { ascending: false })
          .limit(15);
        if (error) {
          console.warn("Could not load activity feed:", error.message);
          return [];
        }
        return data ?? [];
      } catch (err) {
        console.warn("Activity feed error:", err);
        return [];
      }
    },
    retry: false,
  });

  // Trending / suggested repositories
  const { data: trendingRepos } = useQuery({
    queryKey: ["dashboard-trending"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("repositories")
          .select("*, profiles!repositories_owner_id_fkey(username)")
          .eq("is_private", false)
          .order("stars_count", { ascending: false })
          .limit(4);
        if (error) {
          console.warn("Could not load trending repos:", error.message);
          return [];
        }
        return data ?? [];
      } catch (err) {
        console.warn("Trending repos error:", err);
        return [];
      }
    },
    retry: false,
  });

  const filteredRepos = (myRepos ?? []).filter((r: any) =>
    r.name.toLowerCase().includes(repoFilter.toLowerCase().trim()),
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* LEFT COLUMN: Repositories List (280px / 3 cols) */}
        <aside className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Top Repositories</h2>
            <Button asChild size="sm" className="h-7 gap-1 px-2.5 text-xs">
              <Link to="/new">
                <Plus className="h-3 w-3" /> New
              </Link>
            </Button>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Find a repository..."
              value={repoFilter}
              onChange={(e) => setRepoFilter(e.target.value)}
              className="h-8 pl-8 text-xs bg-muted/40"
            />
          </div>

          <div className="space-y-1">
            {loadingMyRepos ? (
              <div className="space-y-2 py-2">
                <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
                <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
                <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
              </div>
            ) : filteredRepos.length > 0 ? (
              filteredRepos.map((repo: any) => (
                <Link
                  key={repo.id}
                  to="/$owner/$repo"
                  params={{ owner: repo.profiles.username, repo: repo.name }}
                  className="group flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <div className="flex items-center gap-2 truncate">
                    <BookMarked className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
                    <span className="truncate font-medium">
                      <span className="text-muted-foreground">{repo.profiles.username}/</span>
                      {repo.name}
                    </span>
                  </div>
                  {repo.is_private ? (
                    <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
                  ) : null}
                </Link>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-border/80 p-4 text-center">
                <p className="text-xs text-muted-foreground">No repositories found.</p>
                <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
                  <Link to="/new">Create one now</Link>
                </Button>
              </div>
            )}
          </div>
        </aside>

        {/* CENTER COLUMN: Activity Feed (6 cols) */}
        <section className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h1 className="text-base font-semibold text-foreground">Recent Activity</h1>
            <div className="flex gap-1 rounded-lg border border-border/60 bg-muted/30 p-0.5">
              <button
                type="button"
                onClick={() => setFeedTab("all")}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  feedTab === "all"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFeedTab("pushes")}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  feedTab === "pushes"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Commits
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {loadingCommits ? (
              Array.from({ length: 4 }).map((_, i) => <FeedItemSkeleton key={i} />)
            ) : recentCommits && recentCommits.length > 0 ? (
              recentCommits.map((c: any) => {
                const owner = c.repositories?.profiles?.username || "developer";
                const repoName = c.repositories?.name || "repo";
                return (
                  <div
                    key={c.id}
                    className="flex items-start gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-xs transition-colors hover:border-border"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <GitCommitHorizontal className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          to="/$owner/$repo"
                          params={{ owner, repo: repoName }}
                          className="font-medium text-xs text-foreground hover:underline"
                        >
                          {owner}/{repoName}
                        </Link>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {(c.id || "").slice(0, 7)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-foreground/90 font-medium truncate">
                        {c.message}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        committed {new Date(c.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState
                icon={GitCommitHorizontal}
                title="No activity yet"
                description="When you push commits or interact with repositories, your feed updates here in real-time."
                actionText="Create your first repo"
                actionHref="/new"
              />
            )}
          </div>
        </section>

        {/* RIGHT COLUMN: Explore & Developer Tips (3 cols) */}
        <aside className="lg:col-span-3 space-y-6">
          {/* Quick Tip Card */}
          <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 shadow-xs">
            <div className="flex items-center gap-2 text-primary font-semibold text-xs">
              <KeyRound className="h-4 w-4" />
              <span>Git Clone & Push Tip</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              Git clone works out of the box with your GitBowl login or Personal Access Token:
            </p>
            <div className="mt-3 rounded-md bg-background/90 p-2 font-mono text-[11px] text-foreground border border-border">
              git clone https://gitbowl.zone.id/you/app.git
            </div>
          </div>

          {/* Trending Repositories */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Flame className="h-3.5 w-3.5 text-warning" />
                Trending on GitBowl
              </h3>
              <Link to="/explore" className="text-xs text-primary hover:underline">
                Explore &rarr;
              </Link>
            </div>

            <div className="space-y-2">
              {trendingRepos?.map((repo: any) => (
                <Link
                  key={repo.id}
                  to="/$owner/$repo"
                  params={{ owner: repo.profiles?.username || "dev", repo: repo.name }}
                  className="block rounded-lg border border-border/60 bg-card/60 p-3 transition-colors hover:border-border hover:bg-card"
                >
                  <p className="text-xs font-semibold text-foreground truncate">
                    {repo.profiles?.username}/{repo.name}
                  </p>
                  {repo.description && (
                    <p className="mt-1 text-[11px] text-muted-foreground truncate">
                      {repo.description}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3 text-warning fill-warning" />
                      {repo.stars_count || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <GitFork className="h-3 w-3" />
                      {repo.forks_count || 0}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                             LOGGED OUT LANDING                             */
/* -------------------------------------------------------------------------- */

function LandingView() {
  const [terminalStep, setTerminalStep] = useState(0);

  // Typewriter sequence for hero terminal
  useEffect(() => {
    const timer = setInterval(() => {
      setTerminalStep((s) => (s >= 4 ? 0 : s + 1));
    }, 2800);
    return () => clearInterval(timer);
  }, []);

  // Fetch live stats
  const { data: stats } = useQuery({
    queryKey: ["landing-stats"],
    queryFn: async () => {
      try {
        const [{ count: reposCount }, { count: usersCount }, { count: commitsCount }] =
          await Promise.all([
            supabase.from("repositories").select("*", { count: "exact", head: true }),
            supabase.from("profiles").select("*", { count: "exact", head: true }),
            supabase.from("commits").select("*", { count: "exact", head: true }),
          ]);
        return {
          repos: reposCount ?? 0,
          users: usersCount ?? 0,
          commits: commitsCount ?? 0,
        };
      } catch (err) {
        console.warn("Could not load stats:", err);
        return { repos: 0, users: 0, commits: 0 };
      }
    },
    retry: false,
  });

  // Trending repositories
  const { data: topRepos, isLoading: loadingTopRepos } = useQuery({
    queryKey: ["landing-top-repos"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("repositories")
          .select("*, profiles!repositories_owner_id_fkey(username, display_name)")
          .eq("is_private", false)
          .order("stars_count", { ascending: false })
          .limit(6);
        if (error) {
          console.warn("Could not load top repos:", error.message);
          return [];
        }
        return data ?? [];
      } catch (err) {
        console.warn("Top repos error:", err);
        return [];
      }
    },
    retry: false,
  });

  return (
    <div>
      {/* HERO SECTION */}
      <section className="relative overflow-hidden border-b border-border/80 hero-glow py-16 sm:py-24">
        <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" />
        <div className="mx-auto max-w-7xl px-4 relative z-10">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
            {/* Left Column: Headline & CTAs */}
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Next-generation Git hosting</span>
              </div>

              <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl sm:leading-tight text-balance">
                Your code,{" "}
                <span className="bg-gradient-to-r from-primary to-success bg-clip-text text-transparent">
                  in a bowl.
                </span>
              </h1>

              <p className="max-w-xl mx-auto lg:mx-0 text-base text-muted-foreground sm:text-lg sm:leading-relaxed text-pretty">
                A fast, modern GitHub alternative with in-browser Monaco editing, zip project
                imports, real Git over HTTPS, and zero enterprise fluff.
              </p>

              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 pt-2">
                <Button asChild size="lg" className="h-11 px-6 text-sm font-semibold shadow-md">
                  <Link to="/auth">
                    Sign up free <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="h-11 px-6 text-sm font-medium"
                >
                  <Link to="/explore">
                    <Compass className="mr-2 h-4 w-4 text-muted-foreground" />
                    Explore repositories
                  </Link>
                </Button>
              </div>

              {/* Trust bullets */}
              <div className="pt-4 flex flex-wrap items-center justify-center lg:justify-start gap-5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-success" /> Real Git HTTPS protocol
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-success" /> Instant zip file unzipping
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-success" /> VS Code in your browser
                </span>
              </div>
            </div>

            {/* Right Column: Animated Typewriter Terminal */}
            <div className="lg:col-span-5">
              <div className="overflow-hidden rounded-xl border border-border/80 bg-card/95 shadow-2xl backdrop-blur">
                {/* Terminal Header */}
                <div className="flex h-9 items-center justify-between border-b border-border/80 bg-muted/60 px-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-destructive/80" />
                    <span className="h-3 w-3 rounded-full bg-warning/80" />
                    <span className="h-3 w-3 rounded-full bg-success/80" />
                  </div>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    bash &mdash; gitbowl
                  </span>
                  <div className="w-10" />
                </div>

                {/* Terminal Body */}
                <div className="p-4 font-mono text-xs text-foreground/90 space-y-2 h-[220px]">
                  <p className="text-muted-foreground">
                    <span className="text-success">$</span> git clone
                    https://gitbowl.zone.id/zarir/app.git
                  </p>
                  {terminalStep >= 1 && (
                    <p className="text-muted-foreground">
                      Cloning into &apos;app&apos;... <span className="text-success">done.</span>
                    </p>
                  )}
                  {terminalStep >= 2 && (
                    <p className="text-muted-foreground">
                      <span className="text-success">$</span> cd app && code .
                    </p>
                  )}
                  {terminalStep >= 3 && (
                    <p className="text-muted-foreground">
                      <span className="text-success">$</span> git commit -am &quot;ship with
                      gitbowl&quot;
                    </p>
                  )}
                  {terminalStep >= 4 && (
                    <p className="text-muted-foreground">
                      <span className="text-success">$</span> git push origin main
                      <br />
                      <span className="text-primary">&rarr;</span> Remote: Changes unpacked into
                      bowl.
                    </p>
                  )}
                  <span className="inline-block h-4 w-2 animate-pulse bg-primary align-middle" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* LIVE STATS STRIP */}
      <section className="border-b border-border bg-card/50 py-6">
        <div className="mx-auto max-w-7xl px-4">
          <div className="grid grid-cols-3 divide-x divide-border text-center">
            <div className="px-4">
              <div className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {stats?.repos ?? 0}+
              </div>
              <div className="text-xs font-medium text-muted-foreground mt-0.5">Repositories</div>
            </div>
            <div className="px-4">
              <div className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {stats?.users ?? 0}+
              </div>
              <div className="text-xs font-medium text-muted-foreground mt-0.5">Developers</div>
            </div>
            <div className="px-4">
              <div className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {stats?.commits ?? 0}+
              </div>
              <div className="text-xs font-medium text-muted-foreground mt-0.5">
                Commits Recorded
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* EVERYTHING YOU NEED (6 Feature Cards) */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Everything you need to ship
            </h2>
            <p className="text-sm text-muted-foreground">
              Built from scratch for developers who want simplicity, speed, and standard Git
              compatibility.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: TerminalIcon,
                title: "Real Git over HTTPS",
                body: "Clone, pull, and push directly from your command line terminal or favorite IDE using token credentials.",
              },
              {
                icon: Code2,
                title: "In-Browser Web Editor",
                body: "Monaco-powered VS Code environment right inside your browser with syntax highlighting and file tree.",
              },
              {
                icon: FileArchive,
                title: "Instant Zip Import",
                body: "Drop a whole project .zip archive and GitBowl automatically unpacks all directories and files cleanly.",
              },
              {
                icon: GitFork,
                title: "Forks & Stars",
                body: "Fork public repositories to your profile with one click, explore forks, and star community projects.",
              },
              {
                icon: Search,
                title: "Global ⌘K Command Palette",
                body: "Lightning fast command palette to instantly jump to any repository, issue, or developer profile.",
              },
              {
                icon: ShieldCheck,
                title: "Free & Open Access",
                body: "Host unlimited public and private repositories without annoying enterprise limits or dark patterns.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="group relative rounded-xl border border-border/70 bg-card p-6 shadow-xs transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground tracking-tight">
                  {f.title}
                </h3>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS (3 Steps) */}
      <section className="border-t border-border bg-card/40 py-20">
        <div className="mx-auto max-w-7xl px-4">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Three simple steps
            </h2>
            <p className="text-sm text-muted-foreground">
              Get your code online and start pushing in under 30 seconds.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Create or import",
                body: "Create a fresh repository or drag-and-drop a zip file with your existing codebase.",
              },
              {
                step: "02",
                title: "Clone or edit",
                body: "Run git clone with standard HTTPS or open the web code editor to write directly.",
              },
              {
                step: "03",
                title: "Push & collaborate",
                body: "Commit changes, push to main, share public links, and let anyone inspect your code.",
              },
            ].map((s) => (
              <div key={s.step} className="rounded-xl border border-border/60 bg-card p-6 relative">
                <span className="font-mono text-3xl font-extrabold text-primary/30">{s.step}</span>
                <h3 className="mt-2 text-base font-semibold text-foreground">{s.title}</h3>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TRENDING REPOSITORIES SECTION */}
      <section className="py-20 border-t border-border">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                Trending repositories
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Explore what developers are building and sharing on GitBowl.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/explore">View all repositories &rarr;</Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {loadingTopRepos
              ? Array.from({ length: 6 }).map((_, i) => <RepoCardSkeleton key={i} />)
              : topRepos?.map((r: any) => (
                  <RepoCard
                    key={r.id}
                    repo={{
                      name: r.name,
                      owner: r.profiles?.username || "dev",
                      description: r.description,
                      isPrivate: r.is_private,
                      starsCount: r.stars_count,
                      forksCount: r.forks_count,
                      updatedAt: r.updated_at,
                    }}
                  />
                ))}
          </div>
        </div>
      </section>
    </div>
  );
}
