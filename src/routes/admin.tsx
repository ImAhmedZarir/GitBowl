// src/routes/admin.tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  ShieldAlert,
  HardDrive,
  Users,
  FolderGit2,
  Activity,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sliders,
  History,
  ArrowUpRight,
  UserCheck,
  UserX,
  Trash2,
  Lock,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin Center — GitBowl" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminDashboardPage,
});

type AdminTab = "overview" | "storage" | "users" | "repositories" | "audit" | "system";

function AdminDashboardPage() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  // Data states
  const [overviewData, setOverviewData] = useState<any>(null);
  const [storageData, setStorageData] = useState<any>(null);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [reposList, setReposList] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [repoSearch, setRepoSearch] = useState("");

  // Check admin authorization strictly server-side via /api/admin/me
  useEffect(() => {
    if (loading) return;
    if (!user) {
      setAuthorized(false);
      return;
    }

    let isCancelled = false;
    async function verifyAdmin() {
      try {
        const headers = await getAuthHeader();
        const res = await fetch("/api/admin/me", { headers });
        if (!res.ok) {
          if (!isCancelled) setAuthorized(false);
          return;
        }
        const data = await res.json();
        if (data.ok && !isCancelled) {
          setAuthorized(true);
          fetchTabData(activeTab);
        } else {
          if (!isCancelled) setAuthorized(false);
        }
      } catch {
        if (!isCancelled) setAuthorized(false);
      }
    }

    verifyAdmin();
    return () => {
      isCancelled = true;
    };
  }, [user, loading, activeTab]);

  async function getAuthHeader(): Promise<HeadersInit> {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token || "";
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  async function fetchTabData(tab: AdminTab) {
    setLoadingData(true);
    try {
      const headers = await getAuthHeader();

      if (tab === "overview") {
        const res = await fetch("/api/admin/overview", { headers });
        if (res.status === 404) {
          setAuthorized(false);
          return;
        }
        const data = await res.json();
        setOverviewData(data);
      } else if (tab === "storage") {
        const res = await fetch("/api/admin/storage/health", { headers });
        const data = await res.json();
        setStorageData(data);
      } else if (tab === "users") {
        const res = await fetch(`/api/admin/users?search=${encodeURIComponent(userSearch)}`, {
          headers,
        });
        const data = await res.json();
        setUsersList(data.users || []);
      } else if (tab === "repositories") {
        const res = await fetch(`/api/admin/repos?search=${encodeURIComponent(repoSearch)}`, {
          headers,
        });
        const data = await res.json();
        setReposList(data.repos || []);
      } else if (tab === "audit") {
        const res = await fetch("/api/admin/audit-logs?limit=40", { headers });
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load admin data");
    } finally {
      setLoadingData(false);
    }
  }

  async function handleRetryJob(jobId?: string) {
    try {
      const headers = await getAuthHeader();
      const res = await fetch("/api/admin/storage/retry", {
        method: "POST",
        headers,
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(jobId ? "Backup job requeued" : `Requeued ${data.retriedCount} backup jobs`);
      fetchTabData("storage");
    } catch (err: any) {
      toast.error(err.message || "Retry failed");
    }
  }

  async function handleToggleSuspendUser(userId: string) {
    try {
      const headers = await getAuthHeader();
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers,
        body: JSON.stringify({ userId, action: "toggle_suspend" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(data.is_suspended ? "User suspended" : "User unsuspended");
      fetchTabData("users");
    } catch (err: any) {
      toast.error(err.message || "Failed to update user");
    }
  }

  async function handleChangeUserRole(userId: string, newRole: string) {
    try {
      const headers = await getAuthHeader();
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers,
        body: JSON.stringify({ userId, action: "change_role", role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`User role changed to ${newRole}`);
      fetchTabData("users");
    } catch (err: any) {
      toast.error(err.message || "Failed to update role");
    }
  }

  async function handleDeleteRepo(repoId: string, repoName: string) {
    if (
      !confirm(`Are you sure you want to permanently delete "${repoName}"? This action is logged.`)
    ) {
      return;
    }
    try {
      const headers = await getAuthHeader();
      const res = await fetch("/api/admin/repos", {
        method: "POST",
        headers,
        body: JSON.stringify({ repoId, action: "delete_repo" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Repository ${repoName} deleted`);
      fetchTabData("repositories");
    } catch (err: any) {
      toast.error(err.message || "Delete failed");
    }
  }

  if (loading || authorized === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-950 text-neutral-100">
        <RefreshCw className="h-6 w-6 animate-spin text-emerald-500 mb-3" />
        <p className="text-xs text-neutral-400 font-mono">Verifying administrator credentials...</p>
      </div>
    );
  }

  // Non-admins get a true 404 page (never disclose admin panel existence)
  if (authorized === false) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">This page could not be found.</p>
        <Button asChild size="sm" variant="outline" className="mt-6">
          <Link to="/">Return to home</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans">
      {/* Top Admin Bar */}
      <header className="sticky top-0 z-50 border-b border-neutral-800 bg-neutral-900/90 backdrop-blur-md px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white font-black text-sm">
              G
            </span>
            <span className="font-bold tracking-tight text-sm text-white">
              GitBowl Admin Center
            </span>
          </div>
          <Badge
            variant="outline"
            className="border-neutral-700 bg-neutral-800/80 text-emerald-400 text-[11px] font-mono"
          >
            Verified Admin: {user?.email}
          </Badge>
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="ghost"
            className="text-neutral-400 hover:text-white text-xs h-8"
            onClick={() => fetchTabData(activeTab)}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loadingData ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="border-neutral-700 bg-neutral-800 text-xs h-8"
          >
            <Link to="/">Exit to GitBowl</Link>
          </Button>
        </div>
      </header>

      {/* Main Admin Content */}
      <div className="flex-1 flex flex-col md:flex-row max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 gap-6">
        {/* Navigation Sidebar */}
        <aside className="w-full md:w-56 shrink-0 space-y-1">
          <button
            onClick={() => setActiveTab("overview")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeTab === "overview"
                ? "bg-emerald-600/15 text-emerald-400 border border-emerald-500/30"
                : "text-neutral-400 hover:bg-neutral-900 hover:text-white"
            }`}
          >
            <Activity className="h-4 w-4" />
            Overview
          </button>
          <button
            onClick={() => setActiveTab("storage")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeTab === "storage"
                ? "bg-emerald-600/15 text-emerald-400 border border-emerald-500/30"
                : "text-neutral-400 hover:bg-neutral-900 hover:text-white"
            }`}
          >
            <HardDrive className="h-4 w-4" />
            Storage & Backups
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeTab === "users"
                ? "bg-emerald-600/15 text-emerald-400 border border-emerald-500/30"
                : "text-neutral-400 hover:bg-neutral-900 hover:text-white"
            }`}
          >
            <Users className="h-4 w-4" />
            Users
          </button>
          <button
            onClick={() => setActiveTab("repositories")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeTab === "repositories"
                ? "bg-emerald-600/15 text-emerald-400 border border-emerald-500/30"
                : "text-neutral-400 hover:bg-neutral-900 hover:text-white"
            }`}
          >
            <FolderGit2 className="h-4 w-4" />
            Repositories
          </button>
          <button
            onClick={() => setActiveTab("audit")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeTab === "audit"
                ? "bg-emerald-600/15 text-emerald-400 border border-emerald-500/30"
                : "text-neutral-400 hover:bg-neutral-900 hover:text-white"
            }`}
          >
            <History className="h-4 w-4" />
            Audit Trail
          </button>
        </aside>

        {/* Tab Panel */}
        <main className="flex-1 space-y-6 min-w-0">
          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
                  <div className="text-xs text-neutral-400">Total Users</div>
                  <div className="mt-1 text-2xl font-bold text-white">
                    {overviewData?.metrics?.users ?? "-"}
                  </div>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
                  <div className="text-xs text-neutral-400">Repositories</div>
                  <div className="mt-1 text-2xl font-bold text-white">
                    {overviewData?.metrics?.repositories ?? "-"}
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-1">
                    {overviewData?.metrics?.publicRepos ?? 0} public /{" "}
                    {overviewData?.metrics?.privateRepos ?? 0} private
                  </div>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
                  <div className="text-xs text-neutral-400">Total Commits</div>
                  <div className="mt-1 text-2xl font-bold text-white">
                    {overviewData?.metrics?.commits ?? "-"}
                  </div>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
                  <div className="text-xs text-neutral-400">Backup Queue Depth</div>
                  <div className="mt-1 text-2xl font-bold text-emerald-400">
                    {overviewData?.metrics?.queue?.pending ?? 0}
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-1">
                    {overviewData?.metrics?.queue?.failed ?? 0} failed /{" "}
                    {overviewData?.metrics?.queue?.completed ?? 0} done
                  </div>
                </div>
              </div>

              {/* Top Repositories */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-5">
                <h3 className="text-sm font-semibold text-white mb-3">Top Starred Repositories</h3>
                <div className="divide-y divide-neutral-800 text-xs">
                  {overviewData?.topRepos?.map((r: any) => (
                    <div key={r.id} className="py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-400">
                          {r.profiles?.username || "owner"} /
                        </span>
                        <span className="font-semibold text-white">{r.name}</span>
                        {r.is_private ? (
                          <Badge
                            variant="outline"
                            className="border-neutral-700 text-neutral-400 text-[10px]"
                          >
                            Private
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-emerald-900/50 text-emerald-400 text-[10px]"
                          >
                            Public
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-neutral-400 font-mono text-[11px]">
                        <span>★ {r.stars_count || 0}</span>
                        <span>⑂ {r.forks_count || 0}</span>
                      </div>
                    </div>
                  ))}
                  {(!overviewData?.topRepos || overviewData.topRepos.length === 0) && (
                    <div className="py-4 text-center text-neutral-500">
                      No repositories created yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: STORAGE & BACKUPS */}
          {activeTab === "storage" && (
            <div className="space-y-6">
              {/* Storage Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">Primary Storage</h3>
                    <Badge
                      variant="outline"
                      className="border-emerald-800 text-emerald-400 text-[10px]"
                    >
                      Active
                    </Badge>
                  </div>
                  <div className="mt-3 text-2xl font-bold text-white">
                    {(Number(storageData?.primaryStorage?.totalBytes || 0) / (1024 * 1024)).toFixed(
                      2,
                    )}{" "}
                    MB
                  </div>
                  <div className="mt-1 text-xs text-neutral-400">
                    {storageData?.primaryStorage?.fileCount || 0} files stored in Supabase Postgres
                    / Object Store
                  </div>
                </div>

                <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">Drive Backup Tier</h3>
                    <Badge
                      variant="outline"
                      className="border-emerald-800 text-emerald-400 text-[10px]"
                    >
                      Connected
                    </Badge>
                  </div>
                  <div className="mt-3 text-xs text-neutral-300 font-mono space-y-1">
                    <div>
                      Account:{" "}
                      <span className="text-neutral-400">
                        {storageData?.backupTier?.maskedServiceAccount}
                      </span>
                    </div>
                    <div>
                      Folder:{" "}
                      <span className="text-neutral-400">
                        {storageData?.backupTier?.maskedFolderId}
                      </span>
                    </div>
                    <div>
                      Completed Jobs:{" "}
                      <span className="text-emerald-400">
                        {storageData?.backupTier?.completedJobs || 0}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Failed Jobs & Retry Controls */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Backup Queue & Failures</h3>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      Failed backups are automatically retried with exponential backoff.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-neutral-700 bg-neutral-800 text-xs h-8"
                    onClick={() => handleRetryJob()}
                  >
                    <RotateCcw className="h-3 w-3 mr-1.5" />
                    Retry All Failed
                  </Button>
                </div>

                <div className="divide-y divide-neutral-800 text-xs">
                  {storageData?.failedJobs?.map((job: any) => (
                    <div key={job.id} className="py-3 flex items-center justify-between gap-4">
                      <div>
                        <div className="font-mono text-neutral-200">
                          {job.repositories?.name || "repo"} @ {job.sha.slice(0, 7)}
                        </div>
                        <div className="text-[11px] text-red-400 mt-0.5 max-w-xl truncate">
                          {job.last_error || "Unknown failure"} (Attempts: {job.attempts})
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-neutral-400 hover:text-white text-xs h-7"
                        onClick={() => handleRetryJob(job.id)}
                      >
                        Retry
                      </Button>
                    </div>
                  ))}
                  {(!storageData?.failedJobs || storageData.failedJobs.length === 0) && (
                    <div className="py-6 text-center text-neutral-400 flex items-center justify-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      All backup jobs are synchronized cleanly. Zero failures.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: USERS */}
          {activeTab === "users" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-500" />
                  <Input
                    placeholder="Search by username or display name..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && fetchTabData("users")}
                    className="pl-9 bg-neutral-900 border-neutral-800 text-white text-xs"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() => fetchTabData("users")}
                  className="bg-emerald-600 hover:bg-emerald-500 text-xs"
                >
                  Search
                </Button>
              </div>

              <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 divide-y divide-neutral-800 text-xs">
                {usersList.map((u: any) => (
                  <div key={u.id} className="p-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{u.username}</span>
                        {u.role === "admin" && (
                          <Badge className="bg-emerald-950 text-emerald-400 border border-emerald-700/60 text-[10px]">
                            Admin
                          </Badge>
                        )}
                        {u.is_suspended && (
                          <Badge variant="destructive" className="text-[10px]">
                            Suspended
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-neutral-400 mt-0.5">
                        {u.display_name || "No display name"} • {u.repoCount || 0} repositories
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-7 text-neutral-400 hover:text-white"
                        onClick={() => handleToggleSuspendUser(u.id)}
                      >
                        {u.is_suspended ? (
                          <UserCheck className="h-3.5 w-3.5 mr-1" />
                        ) : (
                          <UserX className="h-3.5 w-3.5 mr-1 text-red-400" />
                        )}
                        {u.is_suspended ? "Unsuspend" : "Suspend"}
                      </Button>
                      {u.role !== "admin" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-7 text-neutral-400 hover:text-white"
                          onClick={() => handleChangeUserRole(u.id, "admin")}
                        >
                          Make Admin
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-7 text-neutral-400 hover:text-white"
                          onClick={() => handleChangeUserRole(u.id, "user")}
                        >
                          Revoke Admin
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {usersList.length === 0 && (
                  <div className="p-8 text-center text-neutral-500">No users match criteria.</div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: REPOSITORIES */}
          {activeTab === "repositories" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-500" />
                  <Input
                    placeholder="Search repositories..."
                    value={repoSearch}
                    onChange={(e) => setRepoSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && fetchTabData("repositories")}
                    className="pl-9 bg-neutral-900 border-neutral-800 text-white text-xs"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() => fetchTabData("repositories")}
                  className="bg-emerald-600 hover:bg-emerald-500 text-xs"
                >
                  Search
                </Button>
              </div>

              <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 divide-y divide-neutral-800 text-xs">
                {reposList.map((r: any) => (
                  <div key={r.id} className="p-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          to="/$owner/$repo"
                          params={{ owner: r.profiles?.username || "owner", repo: r.name }}
                          className="font-semibold text-white hover:underline"
                        >
                          {r.profiles?.username || "owner"} / {r.name}
                        </Link>
                        {r.is_private ? (
                          <Badge
                            variant="outline"
                            className="border-neutral-700 text-neutral-400 text-[10px]"
                          >
                            Private
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-emerald-900/50 text-emerald-400 text-[10px]"
                          >
                            Public
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-neutral-400 mt-0.5">
                        {r.description || "No description"} • Branch: {r.default_branch}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-7 text-red-400 hover:text-red-300 hover:bg-red-950/40"
                        onClick={() => handleDeleteRepo(r.id, r.name)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
                {reposList.length === 0 && (
                  <div className="p-8 text-center text-neutral-500">No repositories found.</div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: AUDIT LOG */}
          {activeTab === "audit" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
                <h3 className="text-sm font-semibold text-white mb-1">
                  Administrative Audit Trail
                </h3>
                <p className="text-xs text-neutral-400">
                  Every administrative action is permanently recorded for regulatory security.
                </p>

                <div className="mt-4 divide-y divide-neutral-800 text-xs">
                  {auditLogs.map((log: any) => (
                    <div key={log.id} className="py-2.5 flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-emerald-400">{log.action}</span>
                          <span className="text-neutral-500">on</span>
                          <span className="text-neutral-300 font-mono">
                            {log.target_type} ({log.target_id || "general"})
                          </span>
                        </div>
                        <div className="text-[11px] text-neutral-500 mt-0.5">
                          Actor: {log.profiles?.username || "system"} • IP: {log.ip || "internal"}
                        </div>
                      </div>
                      <div className="text-[11px] text-neutral-500 font-mono shrink-0">
                        {new Date(log.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                  {auditLogs.length === 0 && (
                    <div className="py-6 text-center text-neutral-500">
                      No audit logs recorded yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
