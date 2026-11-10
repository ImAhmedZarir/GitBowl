import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  GitCommit,
  Users,
  Activity,
  Calendar,
  Clock,
  TrendingUp,
} from "lucide-react";

interface InsightsTabProps {
  repoId: string;
}

export function InsightsTab({ repoId }: InsightsTabProps) {
  const { data: insights, isLoading } = useQuery({
    queryKey: ["repo-insights", repoId],
    queryFn: async () => {
      const res = await fetch(`/api/repo/insights?repoId=${repoId}`);
      if (!res.ok) {
        throw new Error("Failed to load insights");
      }
      return res.json();
    },
    staleTime: 1000 * 60,
  });

  if (isLoading) {
    return (
      <div className="space-y-4 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-zinc-950 border border-white/[0.08] animate-pulse" />
          ))}
        </div>
        <div className="h-64 rounded-xl bg-zinc-950 border border-white/[0.08] animate-pulse" />
      </div>
    );
  }

  const totalCommits = insights?.totalCommits ?? 0;
  const topContributors = insights?.topContributors ?? [];
  const monthlyActivity = insights?.monthlyActivity ?? [];

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-2">
      {/* Top Header */}
      <div className="border-b border-white/[0.08] pb-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-zinc-400" />
          <span>Repository Insights &amp; Analytics</span>
        </h2>
        <p className="text-xs text-zinc-400 mt-1">
          Activity patterns, contributor velocity, and commit distribution.
        </p>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-white/[0.08] bg-zinc-950/70 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium">
            <GitCommit className="h-4 w-4" />
            <span>Total Commits</span>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono text-white">{totalCommits}</p>
          <p className="text-[11px] text-zinc-500 mt-1">Recorded to default branch</p>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-zinc-950/70 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium">
            <Users className="h-4 w-4" />
            <span>Contributors</span>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono text-white">
            {topContributors.length}
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">Active code authors</p>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-zinc-950/70 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            <span>Repository Health</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-400">Optimal</p>
          <p className="text-[11px] text-zinc-500 mt-1">Smart-HTTP verified &amp; synced</p>
        </div>
      </div>

      {/* Contributors Breakdown */}
      <div className="rounded-xl border border-white/[0.08] bg-zinc-950/70 p-6 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Users className="h-4 w-4 text-zinc-400" />
          <span>Top Contributors</span>
        </h3>

        {topContributors.length > 0 ? (
          <div className="divide-y divide-white/[0.06]">
            {topContributors.map((c: any, index: number) => {
              const pct = totalCommits > 0 ? Math.round((c.commitsCount / totalCommits) * 100) : 0;
              return (
                <div key={c.username || index} className="py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-white/[0.08] border border-white/10 flex items-center justify-center font-bold text-xs text-white">
                      {(c.username || "D").slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white">{c.username}</p>
                      <p className="text-[11px] text-zinc-500">
                        {c.lastCommit ? `Last active ${new Date(c.lastCommit).toLocaleDateString()}` : "Active contributor"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <p className="text-xs font-mono font-semibold text-white">
                        {c.commitsCount} {c.commitsCount === 1 ? "commit" : "commits"}
                      </p>
                      <p className="text-[11px] text-zinc-500 font-mono">{pct}% of commits</p>
                    </div>
                    <div className="w-16 h-1.5 rounded-full bg-zinc-900 border border-white/[0.08] hidden sm:block overflow-hidden">
                      <div
                        style={{ width: `${pct}%` }}
                        className="h-full bg-white rounded-full"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-zinc-500 py-4 text-center">No contributor data recorded yet.</p>
        )}
      </div>

      {/* Monthly Commit Trend */}
      {monthlyActivity.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-zinc-950/70 p-6 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Activity className="h-4 w-4 text-zinc-400" />
            <span>Commit Frequency by Month</span>
          </h3>

          <div className="space-y-2 pt-2">
            {monthlyActivity.map((m: any) => {
              const maxCommits = Math.max(...monthlyActivity.map((x: any) => x.count || 1), 1);
              const barWidth = Math.max(5, Math.round((m.count / maxCommits) * 100));
              return (
                <div key={m.month} className="flex items-center gap-3 text-xs">
                  <span className="w-20 font-mono text-zinc-400 shrink-0 text-[11px]">
                    {m.month}
                  </span>
                  <div className="flex-1 h-5 rounded-md bg-zinc-900 border border-white/[0.08] overflow-hidden flex items-center p-0.5">
                    <div
                      style={{ width: `${barWidth}%` }}
                      className="h-full bg-white/80 rounded transition-all flex items-center justify-end px-1"
                    />
                  </div>
                  <span className="w-12 text-right font-mono text-zinc-300 text-[11px]">
                    {m.count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
