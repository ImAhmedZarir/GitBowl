import { useState, useMemo, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { OrgProfileView } from "@/components/OrgProfileView";
import { RepoCard } from "@/components/RepoCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  BookOpen,
  BookMarked,
  LayoutGrid,
  Package,
  Star,
  Users,
  Link as LinkIcon,
  MapPin,
  Smile,
  Search,
  Plus,
  GitCommit,
  ChevronDown,
} from "lucide-react";

export const Route = createFileRoute("/$owner/")({
  validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
    tab: (search["tab"] as string) || "overview",
  }),
  head: ({ params }) => {
    const canonicalUrl = `https://gitbowl.zone.id/${params.owner}`;
    const profileSchema = {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      dateCreated: "2026-01-01T00:00:00Z",
      mainEntity: {
        "@type": "Person",
        name: params.owner,
        identifier: params.owner,
        url: canonicalUrl,
      },
    };

    return {
      meta: [
        { title: `${params.owner} (Developer Profile) — GitBowl` },
        {
          name: "description",
          content: `View public repositories, source code, and developer contributions by ${params.owner} on GitBowl.`,
        },
        { property: "og:site_name", content: "GitBowl" },
        { property: "og:type", content: "profile" },
        { property: "og:title", content: `${params.owner} — GitBowl` },
        {
          property: "og:description",
          content: `Repositories, open source code, and activity by ${params.owner} on GitBowl.`,
        },
        { property: "og:url", content: canonicalUrl },
        { property: "og:image", content: "https://gitbowl.zone.id/og-image.png" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: `${params.owner} — GitBowl` },
        {
          name: "twitter:description",
          content: `View public code repositories by ${params.owner} on GitBowl.`,
        },
        { name: "twitter:image", content: "https://gitbowl.zone.id/og-image.png" },
      ],
      links: [{ rel: "canonical", href: canonicalUrl }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(profileSchema),
        },
      ],
    };
  },
  component: OwnerPage,
});

// Compute actual 52-week contribution heatmap from real commits, repositories, PRs, and issues
function computeRealContributionWeeks(
  commitsInput?: { created_at: string }[] | null,
  reposInput?: { created_at: string }[] | null,
  prsInput?: { created_at: string }[] | null,
  issuesInput?: { created_at: string }[] | null,
  selectedYear: number = new Date().getUTCFullYear(),
) {
  const commits = Array.isArray(commitsInput) ? commitsInput : [];
  const repos = Array.isArray(reposInput) ? reposInput : [];
  const prs = Array.isArray(prsInput) ? prsInput : [];
  const issues = Array.isArray(issuesInput) ? issuesInput : [];

  // Map events to date counts (YYYY-MM-DD)
  const countMap: Record<string, number> = {};

  for (const c of commits) {
    if (!c.created_at) continue;
    const dStr = c.created_at.split("T")[0];
    if (dStr) countMap[dStr] = (countMap[dStr] || 0) + 1;
  }

  for (const r of repos) {
    if (!r.created_at) continue;
    const dStr = r.created_at.split("T")[0];
    if (dStr) countMap[dStr] = (countMap[dStr] || 0) + 1;
  }

  for (const p of prs) {
    if (!p.created_at) continue;
    const dStr = p.created_at.split("T")[0];
    if (dStr) countMap[dStr] = (countMap[dStr] || 0) + 1;
  }

  for (const i of issues) {
    if (!i.created_at) continue;
    const dStr = i.created_at.split("T")[0];
    if (dStr) countMap[dStr] = (countMap[dStr] || 0) + 1;
  }

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const isCurrentYear = selectedYear === currentYear;

  // For current year: end on the coming Saturday (end of current week)
  // For previous years: end on the Saturday on/after Dec 31
  let endDate: Date;
  if (isCurrentYear) {
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayOfWeek = today.getUTCDay(); // 0 = Sun, 6 = Sat
    endDate = new Date(today);
    endDate.setUTCDate(today.getUTCDate() + (6 - dayOfWeek));
  } else {
    const dec31 = new Date(Date.UTC(selectedYear, 11, 31));
    const dayOfWeek = dec31.getUTCDay();
    endDate = new Date(dec31);
    endDate.setUTCDate(dec31.getUTCDate() + (6 - dayOfWeek));
  }

  // Exactly 52 weeks = 52 * 7 = 364 days
  const startDate = new Date(endDate);
  startDate.setUTCDate(endDate.getUTCDate() - (52 * 7 - 1));

  let totalCount = 0;
  const weeks: { date: string; count: number; level: number }[][] = [];
  const monthLabels: { label: string; col: number }[] = [];
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  let prevMonth = -1;

  for (let w = 0; w < 52; w++) {
    const week: { date: string; count: number; level: number }[] = [];
    for (let d = 0; d < 7; d++) {
      const cur = new Date(startDate);
      cur.setUTCDate(startDate.getUTCDate() + (w * 7 + d));
      const dateStr = cur.toISOString().split("T")[0] || "";

      if (d === 0) {
        const m = cur.getUTCMonth();
        if (m !== prevMonth) {
          monthLabels.push({ label: monthNames[m]!, col: w });
          prevMonth = m;
        }
      }

      // If viewing a previous year, only count days in that year; for current year, count all trailing 52 weeks
      const inYear = isCurrentYear || cur.getUTCFullYear() === selectedYear;
      const count = inYear && dateStr ? countMap[dateStr] || 0 : 0;
      totalCount += count;

      let level = 0;
      if (count === 0) level = 0;
      else if (count <= 1) level = 1;
      else if (count <= 3) level = 2;
      else if (count <= 6) level = 3;
      else level = 4;

      week.push({
        date: dateStr,
        count,
        level,
      });
    }
    weeks.push(week);
  }

  return { weeks, monthLabels, totalCount };
}

function OwnerPage() {
  const { owner } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { profile: me, user } = useAuth();

  const currentTab = search.tab || "overview";
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [repoSearch, setRepoSearch] = useState("");
  const [followBusy, setFollowBusy] = useState(false);
  const [hoveredTile, setHoveredTile] = useState<{
    date: string;
    count: number;
    text: string;
  } | null>(null);

  // 1. Fetch Profile, Repositories, Commits, and Stars directly from Supabase
  const { data, isLoading } = useQuery({
    queryKey: ["owner-profile", owner],
    queryFn: async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("username", owner)
        .maybeSingle();

      if (!profile) {
        const { data: org } = await supabase
          .from("orgs" as any)
          .select("*")
          .ilike("slug", owner)
          .maybeSingle();

        if (!org) return null;

        const [orgReposRes, orgMembersRes, orgTeamsRes] = await Promise.all([
          supabase
            .from("repositories" as any)
            .select("*")
            .eq("org_id", (org as any).id)
            .order("updated_at", { ascending: false }),
          supabase
            .from("org_members" as any)
            .select("id, role, user:user_id(id, username, display_name, avatar_url)")
            .eq("org_id", (org as any).id),
          supabase
            .from("teams" as any)
            .select("id, name, slug, description, privacy, created_at")
            .eq("org_id", (org as any).id),
        ]);

        return {
          isOrg: true,
          org,
          profile: {
            id: (org as any).id,
            username: (org as any).slug,
            display_name: (org as any).display_name || (org as any).name,
            avatar_url: (org as any).avatar_url,
            bio: (org as any).description,
          },
          repos: (orgReposRes.data ?? []) as any[],
          members: orgMembersRes.data ?? [],
          teams: orgTeamsRes.data ?? [],
          commits: [],
          stars: [],
        };
      }

      const [reposRes, commitsRes, starsRes, prsRes, issuesRes] = await Promise.all([
        supabase
          .from("repositories" as any)
          .select("*")
          .eq("owner_id", profile.id)
          .order("updated_at", { ascending: false }),
        supabase
          .from("commits")
          .select("id, repo_id, created_at, message, repositories(name)")
          .eq("author_id", profile.id)
          .order("created_at", { ascending: false }),
        supabase.from("stars").select("repo_id, repositories(*)").eq("user_id", profile.id),
        supabase
          .from("pull_requests" as any)
          .select("id, repo_id, state, created_at")
          .eq("author_id", profile.id),
        supabase
          .from("issues" as any)
          .select("id, repo_id, state, created_at")
          .eq("author_id", profile.id),
      ]);

      return {
        profile,
        repos: (reposRes.data ?? []) as any[],
        commits: commitsRes.data ?? [],
        stars: starsRes.data ?? [],
        pullRequests: (prsRes.data ?? []) as any[],
        issues: (issuesRes.data ?? []) as any[],
      };
    },
  });

  // Real-time synchronization for profile contributions, repos, and activity
  useEffect(() => {
    if (typeof window === "undefined" || !data?.profile?.id) return;
    const profileId = data.profile.id;
    let channel: any = null;
    try {
      channel = supabase
        .channel(`profile-realtime-${profileId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "commits", filter: `author_id=eq.${profileId}` },
          () => {
            qc.invalidateQueries({ queryKey: ["owner-profile", owner] });
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "repositories",
            filter: `owner_id=eq.${profileId}`,
          },
          () => {
            qc.invalidateQueries({ queryKey: ["owner-profile", owner] });
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "pull_requests",
            filter: `author_id=eq.${profileId}`,
          },
          () => {
            qc.invalidateQueries({ queryKey: ["owner-profile", owner] });
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "issues", filter: `author_id=eq.${profileId}` },
          () => {
            qc.invalidateQueries({ queryKey: ["owner-profile", owner] });
          },
        )
        .subscribe();
    } catch {
      // ignore
    }
    return () => {
      if (channel) supabase.removeChannel(channel).catch(() => {});
    };
  }, [data?.profile?.id, owner, qc]);

  // 2. Fetch Real Followers / Following and metadata
  const { data: followData, refetch: refetchFollow } = useQuery({
    queryKey: ["user-follow-stats", data?.profile?.id],
    enabled: typeof window !== "undefined" && !!data?.profile?.id,
    queryFn: async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const res = await fetch(`/api/user/follow?userId=${data!.profile.id}`, {
          headers: {
            Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
          },
        });
        if (!res.ok) {
          return { followersCount: 0, followingCount: 0, isFollowing: false, metadata: {} };
        }
        return await res.json();
      } catch {
        return { followersCount: 0, followingCount: 0, isFollowing: false, metadata: {} };
      }
    },
  });

  const isMe = me?.id === data?.profile?.id;

  // Real-time follow toggle
  async function handleToggleFollow() {
    if (!user) {
      return void toast.error("Please sign in to follow users");
    }
    if (!data?.profile?.id || followBusy) return;

    setFollowBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch("/api/user/follow", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
        },
        body: JSON.stringify({
          targetUserId: data.profile.id,
          action: followData?.isFollowing ? "unfollow" : "follow",
        }),
      });

      const resData = await res.json();
      if (!res.ok || resData.error) {
        throw new Error(resData.error || "Failed to update follow");
      }

      await refetchFollow();
      toast.success(resData.isFollowing ? `Followed @${owner}` : `Unfollowed @${owner}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to update follow");
    } finally {
      setFollowBusy(false);
    }
  }

  // Real contributions calculated from database (commits, repos, PRs, issues)
  const { weeks, monthLabels, totalCount } = useMemo(
    () =>
      computeRealContributionWeeks(
        data?.commits,
        data?.repos,
        data?.pullRequests,
        data?.issues,
        selectedYear,
      ),
    [data?.commits, data?.repos, data?.pullRequests, data?.issues, selectedYear],
  );

  // Dynamically compute REAL earned achievements from actual database data (no fake achievements!)
  const earnedAchievements = useMemo(() => {
    const achs: Array<{
      id: string;
      emoji: string;
      title: string;
      description: string;
      bgClass: string;
    }> = [];

    const repoCount = data?.repos?.length || 0;
    const commitCount = data?.commits?.length || 0;
    const starCount = data?.stars?.length || 0;
    const prCount = data?.pullRequests?.length || 0;
    const mergedPrCount = data?.pullRequests?.filter((p: any) => p.state === "merged")?.length || 0;
    const issueCount = data?.issues?.length || 0;
    const hasPublicRepo = data?.repos?.some((r: any) => !r.is_private) || false;

    if (mergedPrCount >= 1) {
      achs.push({
        id: "pull-shark",
        emoji: "🦈",
        title: "Pull Shark",
        description: `Merged ${mergedPrCount} pull request(s) on GitBowl`,
        bgClass: "bg-cyan-500/10 border-cyan-500/30 text-cyan-400",
      });
    }

    if (repoCount >= 1) {
      achs.push({
        id: "first-flight",
        emoji: "🚀",
        title: "First Flight",
        description: "Created first repository on GitBowl",
        bgClass: "bg-blue-500/10 border-blue-500/30 text-blue-400",
      });
    }

    if (commitCount >= 5) {
      achs.push({
        id: "code-crafter",
        emoji: "💻",
        title: "Code Crafter",
        description: `Authored ${commitCount} verified commits to repositories`,
        bgClass: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
      });
    }

    if (hasPublicRepo) {
      achs.push({
        id: "open-sourcer",
        emoji: "🌐",
        title: "Open Sourcer",
        description: "Published public open-source code on GitBowl",
        bgClass: "bg-amber-500/10 border-amber-500/30 text-amber-400",
      });
    }

    if (starCount >= 1) {
      achs.push({
        id: "stargazer",
        emoji: "⭐",
        title: "Stargazer",
        description: `Starred ${starCount} repository on GitBowl`,
        bgClass: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400",
      });
    }

    if (issueCount >= 1) {
      achs.push({
        id: "bug-hunter",
        emoji: "🎯",
        title: "Bug Hunter",
        description: `Opened ${issueCount} issue report(s)`,
        bgClass: "bg-rose-500/10 border-rose-500/30 text-rose-400",
      });
    }

    if (commitCount >= 10) {
      achs.push({
        id: "galaxy-brain",
        emoji: "🧠",
        title: "Galaxy Brain",
        description: `Authored ${commitCount} commits on GitBowl`,
        bgClass: "bg-purple-500/10 border-purple-500/30 text-purple-400",
      });
    }

    return achs;
  }, [data?.repos, data?.commits, data?.stars, data?.pullRequests, data?.issues]);

  // Filter repositories
  const filteredRepos = useMemo(() => {
    if (!data?.repos) return [];
    return data.repos.filter((r) => {
      return (
        r.name.toLowerCase().includes(repoSearch.toLowerCase()) ||
        (r.description && r.description.toLowerCase().includes(repoSearch.toLowerCase()))
      );
    });
  }, [data?.repos, repoSearch]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background flex flex-col justify-between">
        <Header />
        <div className="mx-auto max-w-md px-4 py-24 text-center flex-1">
          <div className="h-16 w-16 mx-auto rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-4">
            <Users className="h-8 w-8" />
          </div>
          <h1 className="text-xl font-bold text-foreground">User not found</h1>
          <p className="mt-2 text-xs text-muted-foreground">
            No GitBowl account found for{" "}
            <span className="font-mono text-foreground font-semibold">@{owner}</span>.
          </p>
          <Button asChild size="sm" className="mt-6">
            <Link to="/explore">Explore developers & repositories</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (data.isOrg) {
    return (
      <div className="min-h-screen bg-background flex flex-col justify-between">
        <div>
          <Header />
          <OrgProfileView
            org={(data as any).org}
            repos={(data as any).repos}
            members={(data as any).members}
            teams={(data as any).teams}
            currentUser={me}
            currentTab={currentTab}
            onTabChange={(tab) => {
              navigate({
                search: { tab } as any,
                replace: true,
              });
            }}
            onRefresh={() => {
              qc.invalidateQueries({ queryKey: ["owner-profile", owner] });
            }}
          />
        </div>
        <Footer />
      </div>
    );
  }

  // Profile data from database & metadata
  const profile = data.profile;
  const meta = followData?.metadata || {};

  const displayName = profile.display_name || profile.username;
  const displayHandle = profile.username;
  const pronouns = meta.pronouns || null;
  const bio = profile.bio || "Building open-source software on GitBowl.";
  const websiteUrl = meta.website || null;
  const location = meta.location || null;
  const avatarUrl =
    (profile as any).avatar_url ||
    meta.avatar_url ||
    (isMe ? (user as any)?.user_metadata?.avatar_url : null);

  const followersCount = followData?.followersCount ?? 0;
  const followingCount = followData?.followingCount ?? 0;
  const isFollowing = followData?.isFollowing ?? false;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      {/* GITHUB SUB-NAVIGATION TABS BAR */}
      <div className="border-b border-border/80 bg-background/50 sticky top-14 z-30 backdrop-blur-xs">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <nav className="flex space-x-1 sm:space-x-3 overflow-x-auto no-scrollbar py-1">
            <button
              type="button"
              onClick={() =>
                navigate({ to: "/$owner", params: { owner }, search: { tab: "overview" } })
              }
              className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                currentTab === "overview"
                  ? "border-[#f78166] text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              <BookOpen className="h-4 w-4" />
              Overview
            </button>

            <button
              type="button"
              onClick={() =>
                navigate({ to: "/$owner", params: { owner }, search: { tab: "repositories" } })
              }
              className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                currentTab === "repositories"
                  ? "border-[#f78166] text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              <BookMarked className="h-4 w-4" />
              Repositories
              <span className="rounded-full bg-muted/60 px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground">
                {data.repos.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                navigate({ to: "/$owner", params: { owner }, search: { tab: "projects" } })
              }
              className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                currentTab === "projects"
                  ? "border-[#f78166] text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              Projects
            </button>

            <button
              type="button"
              onClick={() =>
                navigate({ to: "/$owner", params: { owner }, search: { tab: "packages" } })
              }
              className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                currentTab === "packages"
                  ? "border-[#f78166] text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              <Package className="h-4 w-4" />
              Packages
            </button>

            <button
              type="button"
              onClick={() =>
                navigate({ to: "/$owner", params: { owner }, search: { tab: "stars" } })
              }
              className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                currentTab === "stars"
                  ? "border-[#f78166] text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              <Star className="h-4 w-4" />
              Stars
              <span className="rounded-full bg-muted/60 px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground">
                {data.stars.length}
              </span>
            </button>
          </nav>
        </div>
      </div>

      {/* MAIN CONTAINER: 2-COLUMN GITHUB LAYOUT */}
      <main className="mx-auto max-w-7xl w-full px-4 sm:px-6 py-8 flex-1">
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] lg:grid-cols-[300px_1fr] gap-8 items-start">
          {/* LEFT COLUMN: USER IDENTITY */}
          <aside className="space-y-4">
            {/* Big Circular Avatar with Status Button */}
            <div className="relative mx-auto md:mx-0 w-64 h-64 sm:w-72 sm:h-72 rounded-full overflow-hidden border-2 border-border/80 bg-muted/40 shadow-sm group">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-102"
                />
              ) : (
                <div className="h-full w-full bg-gradient-to-tr from-primary/30 to-primary/10 flex items-center justify-center text-5xl font-bold text-primary">
                  {displayName.slice(0, 2).toUpperCase()}
                </div>
              )}

              {/* Status Smile Button */}
              {isMe && (
                <button
                  type="button"
                  title="Edit status"
                  onClick={() => navigate({ to: "/settings", search: { tab: "profile" } })}
                  className="absolute bottom-4 right-4 h-9 w-9 rounded-full bg-card border border-border shadow-md flex items-center justify-center text-foreground hover:bg-muted transition-transform active:scale-95"
                >
                  <Smile className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>

            {/* Name & Handle */}
            <div className="pt-2 text-center md:text-left">
              <h1 className="text-2xl font-bold tracking-tight text-foreground leading-tight">
                {displayName}
              </h1>
              <p className="text-base text-muted-foreground font-light mt-0.5">
                {displayHandle}{" "}
                {pronouns && <span className="text-muted-foreground/80">· {pronouns}</span>}
              </p>
            </div>

            {/* Bio */}
            {bio && <p className="text-xs text-foreground leading-relaxed">{bio}</p>}

            {/* Action Button: Edit profile / Follow */}
            <div>
              {isMe ? (
                <Button
                  asChild
                  variant="outline"
                  className="w-full text-xs font-semibold h-8 rounded-md bg-muted/30 hover:bg-muted/70 border-border"
                >
                  <Link to="/settings" search={{ tab: "profile" }}>
                    Edit profile
                  </Link>
                </Button>
              ) : (
                <Button
                  onClick={handleToggleFollow}
                  disabled={followBusy}
                  variant={isFollowing ? "outline" : "default"}
                  className="w-full text-xs font-semibold h-8 rounded-md"
                >
                  {isFollowing ? "Unfollow" : "Follow"}
                </Button>
              )}
            </div>

            {/* REAL Followers / Following */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
              <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="font-semibold text-foreground">{followersCount}</span>{" "}
              {followersCount === 1 ? "follower" : "followers"}
              <span>·</span>
              <span className="font-semibold text-foreground">{followingCount}</span> following
            </div>

            {/* Details: Website & Location */}
            {(location || websiteUrl) && (
              <div className="space-y-2 pt-2 text-xs text-muted-foreground border-t border-border/80">
                {location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span>{location}</span>
                  </div>
                )}

                {websiteUrl && (
                  <div className="flex items-center gap-2 truncate">
                    <LinkIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <a
                      href={websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline truncate"
                    >
                      {websiteUrl}
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Achievements */}
            <div className="pt-2 border-t border-border/80">
              <h2 className="text-xs font-semibold text-foreground">Achievements</h2>
              {earnedAchievements.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {earnedAchievements.map((ach) => (
                    <div
                      key={ach.id}
                      className={`h-8 w-8 rounded-full border flex items-center justify-center text-sm shadow-xs ${ach.bgClass}`}
                      title={`${ach.title}: ${ach.description}`}
                    >
                      {ach.emoji}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground mt-1.5 italic">
                  No achievements earned yet. Commit code and create repositories to unlock badges!
                </p>
              )}
            </div>
          </aside>

          {/* RIGHT COLUMN: MAIN CONTENT */}
          <div className="space-y-8 min-w-0">
            {/* TAB: OVERVIEW */}
            {currentTab === "overview" && (
              <>
                {/* Popular Repositories Section */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground">Popular repositories</h2>
                    {isMe && (
                      <Link
                        to="/new"
                        className="text-[11px] text-primary hover:underline cursor-pointer"
                      >
                        Create repository
                      </Link>
                    )}
                  </div>

                  {data.repos.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-8 text-center space-y-2">
                      <BookMarked className="h-8 w-8 text-muted-foreground mx-auto" />
                      <p className="text-xs font-medium text-foreground">No repositories yet</p>
                      {isMe && (
                        <Button asChild size="sm" className="text-xs h-8">
                          <Link to="/new">Create a repository</Link>
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {data.repos.slice(0, 6).map((repo) => (
                        <RepoCard key={repo.id} repo={repo} owner={profile.username} />
                      ))}
                    </div>
                  )}
                </section>

                {/* REAL 52-WEEK CONTRIBUTION CALENDAR HEATMAP */}
                <section className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-foreground">
                      {totalCount} contribution{totalCount !== 1 ? "s" : ""} in{" "}
                      {selectedYear === new Date().getUTCFullYear()
                        ? "the last year"
                        : selectedYear}
                    </h2>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1 cursor-pointer hover:text-foreground">
                        Contribution settings <ChevronDown className="h-3 w-3" />
                      </div>

                      {/* Year Selector Pills */}
                      <div className="flex items-center gap-1">
                        {[2026, 2025, 2024, 2023, 2022].map((year) => (
                          <button
                            key={year}
                            type="button"
                            onClick={() => setSelectedYear(year)}
                            className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors ${
                              selectedYear === year
                                ? "bg-primary text-primary-foreground font-semibold"
                                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                            }`}
                          >
                            {year}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Heatmap Card */}
                  <div className="rounded-lg border border-border/80 bg-card p-4 shadow-xs overflow-x-auto no-scrollbar relative">
                    {/* Floating Hover Tooltip */}
                    {hoveredTile && (
                      <div className="absolute top-2 right-4 text-[11px] font-mono px-2.5 py-1 rounded-md bg-popover text-popover-foreground border border-border shadow-md z-10 animate-in fade-in zoom-in-95 duration-100">
                        {hoveredTile.text}
                      </div>
                    )}

                    {/* Months Header */}
                    <div className="relative h-4 text-[10px] text-muted-foreground font-mono mb-1 ml-7">
                      {monthLabels.map((m, idx) => (
                        <span
                          key={idx}
                          className="absolute text-center"
                          style={{ left: `${(m.col / 52) * 100}%` }}
                        >
                          {m.label}
                        </span>
                      ))}
                    </div>

                    <div className="flex gap-1.5 items-start">
                      {/* Day of Week Labels */}
                      <div className="flex flex-col justify-between text-[9px] text-muted-foreground font-mono pr-1 h-[90px] pt-1">
                        <span>Mon</span>
                        <span>Wed</span>
                        <span>Fri</span>
                      </div>

                      {/* Grid of Weeks */}
                      <div className="flex gap-[3px]">
                        {weeks.map((week, wIdx) => (
                          <div key={wIdx} className="flex flex-col gap-[3px]">
                            {week.map((day, dIdx) => {
                              // GitHub green intensity scale
                              const colorClass =
                                day.level === 0
                                  ? "bg-muted/40 hover:ring-1 hover:ring-foreground/40"
                                  : day.level === 1
                                    ? "bg-[#0e4429] hover:bg-[#125835]"
                                    : day.level === 2
                                      ? "bg-[#006d32] hover:bg-[#00863f]"
                                      : day.level === 3
                                        ? "bg-[#26a641] hover:bg-[#2bc04b]"
                                        : "bg-[#39d353] hover:bg-[#43e65e]";

                              const tooltipText =
                                day.count === 0
                                  ? `No contributions on ${new Date(day.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`
                                  : `${day.count} contribution${day.count > 1 ? "s" : ""} on ${new Date(day.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`;

                              return (
                                <div
                                  key={dIdx}
                                  title={tooltipText}
                                  onMouseEnter={() =>
                                    setHoveredTile({
                                      date: day.date,
                                      count: day.count,
                                      text: tooltipText,
                                    })
                                  }
                                  onMouseLeave={() => setHoveredTile(null)}
                                  className={`h-[10px] w-[10px] rounded-[2px] transition-colors cursor-pointer ${colorClass}`}
                                />
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Legend Footer */}
                    <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="hover:underline cursor-pointer text-muted-foreground">
                        Learn how we count contributions
                      </span>

                      <div className="flex items-center gap-1.5">
                        <span>Less</span>
                        <div className="h-[9px] w-[9px] rounded-[2px] bg-muted/40" />
                        <div className="h-[9px] w-[9px] rounded-[2px] bg-[#0e4429]" />
                        <div className="h-[9px] w-[9px] rounded-[2px] bg-[#006d32]" />
                        <div className="h-[9px] w-[9px] rounded-[2px] bg-[#26a641]" />
                        <div className="h-[9px] w-[9px] rounded-[2px] bg-[#39d353]" />
                        <span>More</span>
                      </div>
                    </div>
                  </div>
                </section>

                {/* REAL CONTRIBUTION ACTIVITY TIMELINE */}
                <section className="space-y-4 pt-2">
                  <h2 className="text-sm font-semibold text-foreground">Contribution activity</h2>

                  {data.commits.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No contribution activity recorded for {selectedYear}.
                    </p>
                  ) : (
                    <div className="border-l-2 border-border ml-3 pl-6 space-y-6">
                      <div>
                        <span className="text-xs font-semibold text-foreground">
                          Recent Commits & Contributions
                        </span>

                        <div className="mt-3 space-y-3">
                          {data.commits.slice(0, 10).map((c: any) => (
                            <div key={c.id} className="flex items-start gap-3">
                              <div className="h-6 w-6 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 -ml-[35px] ring-4 ring-background">
                                <GitCommit className="h-3.5 w-3.5" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs text-foreground font-medium truncate">
                                  {c.message}
                                </p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  {c.repositories?.name ? (
                                    <Link
                                      to="/$owner/$repo"
                                      params={{
                                        owner: profile.username,
                                        repo: c.repositories.name,
                                      }}
                                      className="text-primary hover:underline font-mono"
                                    >
                                      {profile.username}/{c.repositories.name}
                                    </Link>
                                  ) : (
                                    <span className="font-mono">Repository</span>
                                  )}{" "}
                                  ·{" "}
                                  {new Date(c.created_at).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              </>
            )}

            {/* TAB: REPOSITORIES */}
            {currentTab === "repositories" && (
              <section className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={repoSearch}
                      onChange={(e) => setRepoSearch(e.target.value)}
                      placeholder="Find a repository..."
                      className="pl-8 text-xs h-8"
                    />
                  </div>

                  {isMe && (
                    <Button asChild size="sm" className="h-8 text-xs font-semibold gap-1.5">
                      <Link to="/new">
                        <Plus className="h-3.5 w-3.5" /> New
                      </Link>
                    </Button>
                  )}
                </div>

                <div className="divide-y divide-border">
                  {filteredRepos.length === 0 ? (
                    <div className="py-12 text-center text-xs text-muted-foreground">
                      No repositories matched your search.
                    </div>
                  ) : (
                    filteredRepos.map((repo: any) => (
                      <div key={repo.id} className="py-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <Link
                            to="/$owner/$repo"
                            params={{ owner: profile.username, repo: repo.name }}
                            className="text-base font-semibold text-primary hover:underline"
                          >
                            {repo.name}
                          </Link>
                          <span className="rounded-full border border-border/80 px-2 py-0.2 text-[10px] font-medium text-muted-foreground">
                            {repo.is_private ? "Private" : "Public"}
                          </span>
                        </div>

                        {repo.description && (
                          <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
                            {repo.description}
                          </p>
                        )}

                        <div className="flex items-center gap-4 text-[11px] text-muted-foreground pt-1">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                            <span>Code</span>
                          </span>

                          <span className="inline-flex items-center gap-1">
                            <Star className="h-3.5 w-3.5" />
                            <span>{repo.stars_count}</span>
                          </span>

                          <span>
                            Updated{" "}
                            {new Date(repo.updated_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}

            {/* TAB: STARS */}
            {currentTab === "stars" && (
              <section className="space-y-4">
                <h2 className="text-sm font-semibold text-foreground">
                  Starred repositories ({data.stars.length})
                </h2>

                {data.stars.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-8 text-center">
                    No starred repositories yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {data.stars.map((s: any) =>
                      s.repositories ? (
                        <RepoCard
                          key={s.repositories.id}
                          repo={s.repositories}
                          owner={profile.username}
                        />
                      ) : null,
                    )}
                  </div>
                )}
              </section>
            )}

            {/* TAB: PROJECTS & PACKAGES */}
            {(currentTab === "projects" || currentTab === "packages") && (
              <div className="py-16 text-center border border-dashed border-border rounded-lg space-y-2">
                <Package className="h-8 w-8 text-muted-foreground mx-auto" />
                <h3 className="text-sm font-semibold text-foreground capitalize">
                  No {currentTab} published
                </h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  {currentTab === "packages"
                    ? "Publish packages directly from your GitBowl repositories or container registries."
                    : "Plan and track your engineering roadmap with GitBowl Projects."}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
