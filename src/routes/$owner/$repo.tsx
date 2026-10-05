import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useRef } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  CircleDot,
  CircleCheck,
  Plus,
  Code2,
  Copy,
  Download,
  File as FileIcon,
  FilePlus,
  Folder,
  FolderOpen,
  GitCommit,
  GitFork,
  GitPullRequest,
  GitMerge,
  GitBranch,
  History,
  Lock,
  Globe,
  ExternalLink,
  Radio,
  MoreHorizontal,
  Pencil,
  Settings,
  Share2,
  Star,
  Trash2,
  Upload,
  Undo2,
  Eye,
  HardDrive,
  Loader2,
  PanelLeft,
  Terminal,
  KeyRound,
  Check,
  Search,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { useAuth } from "@/lib/auth";
import {
  buildTree,
  copyRepository,
  downloadRepoZip,
  filesFromZip,
  readUploadedFile,
  languageFor,
  type RepoFile,
  type TreeNode,
} from "@/lib/repo";
import {
  repoQueryOptions,
  repoFilesMetaQueryOptions,
  fetchFileContent,
  type RepoFileMeta,
} from "@/lib/repo-queries";
import { CodeEditorLazy } from "@/components/CodeEditorLazy";

type Tab = "code" | "issues" | "pulls" | "commits" | "settings";

export const Route = createFileRoute("/$owner/$repo")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab | undefined } => ({
    tab: ["code", "issues", "pulls", "commits", "settings"].includes(s["tab"] as string)
      ? (s["tab"] as Tab)
      : undefined,
  }),
  loader: async ({ params, context }) => {
    try {
      return await context.queryClient.ensureQueryData(repoQueryOptions(params.owner, params.repo));
    } catch {
      return null;
    }
  },
  head: ({ params }) => ({
    meta: [
      { title: `${params.owner}/${params.repo} — GitBowl` },
      {
        name: "description",
        content: `Browse, edit and clone ${params.owner}/${params.repo} on GitBowl.`,
      },
      { property: "og:title", content: `${params.owner}/${params.repo} — GitBowl` },
      {
        property: "og:description",
        content: `Browse, edit and clone ${params.owner}/${params.repo} on GitBowl.`,
      },
    ],
  }),
  component: RepoPage,
});

function timeAgo(date: string) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function RepoPage() {
  const { owner, repo: repoName } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user, profile } = useAuth();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<Tab>(search.tab ?? "code");

  // Keep activeTab in sync with query param without full unmount
  useEffect(() => {
    if (search.tab && search.tab !== activeTab) {
      setActiveTab(search.tab);
    }
  }, [search.tab, activeTab]);

  function switchTab(t: Tab) {
    setActiveTab(t);
    navigate({
      search: (prev) => ({ ...prev, tab: t === "code" ? undefined : t }),
      replace: true,
    });
  }

  // Preloaded repository metadata (Instant TTFB, 0 waterfalls)
  const { data: repo, isLoading: loadingRepo } = useQuery(repoQueryOptions(owner, repoName));

  // Metadata-only files query (Zero large content download!)
  const { data: filesMeta = [], isLoading: loadingFiles } = useQuery(
    repoFilesMetaQueryOptions(repo?.id),
  );

  // Starred query
  const { data: starred = false } = useQuery({
    queryKey: ["starred", repo?.id, user?.id],
    enabled: !!repo && !!user,
    queryFn: async () => {
      const { data: s } = await supabase
        .from("stars")
        .select("repo_id")
        .eq("repo_id", repo!.id)
        .eq("user_id", user!.id)
        .maybeSingle();
      return !!s;
    },
    staleTime: 1000 * 30,
  });

  // GitHub Sync Status query
  const { data: syncConfig } = useQuery({
    queryKey: ["repo-github-sync", repo?.id],
    enabled: typeof window !== "undefined" && !!repo?.id,
    queryFn: async () => {
      try {
        const res = await fetch(`/api/repo/github-sync?repoId=${repo!.id}`);
        if (!res.ok) return null;
        const json = await res.json();
        return json.config || null;
      } catch {
        return null;
      }
    },
    staleTime: 1000 * 30,
  });

  const isOwner = !!(user && repo && user.id === repo.owner_id);

  // Real-time synchronization for repo files and commits
  useEffect(() => {
    if (typeof window === "undefined" || !repo?.id) return;
    let channel: any = null;
    try {
      channel = supabase
        .channel(`repo-realtime-${repo.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "repo_files", filter: `repo_id=eq.${repo.id}` },
          () => {
            qc.invalidateQueries({ queryKey: ["repo-files-meta", repo.id] });
            qc.invalidateQueries({ queryKey: ["file-content", repo.id] });
          },
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "commits", filter: `repo_id=eq.${repo.id}` },
          () => {
            qc.invalidateQueries({ queryKey: ["repo-commits", repo.id] });
            qc.invalidateQueries({ queryKey: ["repo-stats", repo.id] });
          },
        )
        .subscribe();
    } catch (e) {
      console.warn("Realtime subscription fallback:", e);
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel).catch(() => {
          // ignore cleanup errors
        });
      }
    };
  }, [repo?.id, qc]);

  async function toggleStar() {
    if (!user) return void toast.error("Sign in to star this repository");
    if (!repo) return;

    try {
      if (starred) {
        await supabase.from("stars").delete().eq("repo_id", repo.id).eq("user_id", user.id);
        await supabase
          .from("repositories")
          .update({ stars_count: Math.max(0, (repo.stars_count || 1) - 1) })
          .eq("id", repo.id);
      } else {
        await supabase.from("stars").insert({ repo_id: repo.id, user_id: user.id });
        await supabase
          .from("repositories")
          .update({ stars_count: (repo.stars_count || 0) + 1 })
          .eq("id", repo.id);
      }
      qc.invalidateQueries({ queryKey: ["starred", repo.id] });
      qc.invalidateQueries({ queryKey: ["repo-metadata", owner, repoName] });
    } catch (e: any) {
      toast.error(e.message || "Failed to update star");
    }
  }

  if (loadingRepo) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-7xl px-4 py-8 space-y-4 animate-pulse">
          <div className="h-8 w-64 rounded bg-muted" />
          <div className="h-10 w-full rounded bg-muted/60" />
          <div className="h-96 w-full rounded-xl bg-card border border-border" />
        </div>
      </div>
    );
  }

  if (!repo) {
    return (
      <div className="min-h-screen bg-background flex flex-col justify-between">
        <Header />
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <h1 className="text-xl font-semibold">Repository not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {owner}/{repoName} does not exist or is private.
          </p>
          <Button asChild size="sm" className="mt-6">
            <Link to="/">Back to home</Link>
          </Button>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      {/* REPO HEADER (Persistent across tabs) */}
      <div className="border-b border-border bg-card/60 pt-4">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Owner / Repo Breadcrumb */}
            <div className="flex items-center gap-2 text-base font-semibold tracking-tight min-w-0">
              <Link
                to="/$owner"
                params={{ owner }}
                search={{ tab: "overview" }}
                className="text-primary hover:underline truncate"
              >
                {owner}
              </Link>
              <span className="text-muted-foreground">/</span>
              <span className="text-foreground truncate">{repo.name}</span>
              {repo.is_private ? (
                <span className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
                  <Lock className="h-3 w-3" /> Private
                </span>
              ) : (
                <span className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
                  <Globe className="h-3 w-3" /> Public
                </span>
              )}

              {/* GitHub Sync Status Badge */}
              {syncConfig && (
                <>
                  {syncConfig.sync_status === "synced" && (
                    <span
                      title={`Synced with ${syncConfig.github_owner}/${syncConfig.github_repo}`}
                      className="flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-500"
                    >
                      <Check className="h-3 w-3" /> GitHub Synced
                    </span>
                  )}
                  {syncConfig.sync_status === "syncing" && (
                    <span className="flex items-center gap-1 rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-500">
                      <RefreshCw className="h-3 w-3 animate-spin" /> Syncing...
                    </span>
                  )}
                  {syncConfig.sync_status === "error" && (
                    <span
                      title={syncConfig.last_error || "Sync error"}
                      className="flex items-center gap-1 rounded-full border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive cursor-help"
                    >
                      <AlertCircle className="h-3 w-3" /> Sync Failed
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Watch / Fork / Star Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={toggleStar}
                className="h-8 gap-1.5 text-xs"
              >
                <Star className={`h-3.5 w-3.5 ${starred ? "fill-warning text-warning" : ""}`} />
                <span>{starred ? "Starred" : "Star"}</span>
                <span className="ml-1 rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-mono">
                  {repo.stars_count || 0}
                </span>
              </Button>

              <ForkButton repo={repo} isOwner={isOwner} />

              <ShareButton />
            </div>
          </div>

          {/* GITHUB-PARITY TAB BAR */}
          <nav className="mt-4 flex items-center gap-1 overflow-x-auto border-b border-transparent text-xs font-medium">
            <button
              type="button"
              onClick={() => switchTab("code")}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 transition-colors ${
                activeTab === "code"
                  ? "border-primary text-foreground font-semibold"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              <Code2 className="h-4 w-4" />
              <span>Code</span>
            </button>
            <button
              type="button"
              onClick={() => switchTab("issues")}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 transition-colors ${
                activeTab === "issues"
                  ? "border-primary text-foreground font-semibold"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              <CircleDot className="h-4 w-4" />
              <span>Issues</span>
            </button>
            <button
              type="button"
              onClick={() => switchTab("commits")}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 transition-colors ${
                activeTab === "commits"
                  ? "border-primary text-foreground font-semibold"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              <History className="h-4 w-4" />
              <span>Commits</span>
            </button>
            <button
              type="button"
              onClick={() => switchTab("pulls")}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 transition-colors ${
                activeTab === "pulls"
                  ? "border-primary text-foreground font-semibold"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              <GitPullRequest className="h-4 w-4" />
              <span>Pull requests</span>
            </button>
            {isOwner && (
              <button
                type="button"
                onClick={() => switchTab("settings")}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2 transition-colors ${
                  activeTab === "settings"
                    ? "border-primary text-foreground font-semibold"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </button>
            )}
          </nav>
        </div>
      </div>

      {/* TAB CONTENT (Switches instantly without refetching repository metadata) */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {activeTab === "code" && (
          <CodeTab
            repo={repo}
            filesMeta={filesMeta}
            loadingFiles={loadingFiles}
            isOwner={isOwner}
            authorId={profile?.id}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["repo-files-meta", repo.id] });
              qc.invalidateQueries({ queryKey: ["file-content", repo.id] });
              qc.invalidateQueries({ queryKey: ["repo-commits", repo.id] });
              qc.invalidateQueries({ queryKey: ["repo", owner, repo.name] });
              qc.invalidateQueries({ queryKey: ["repo-metadata", owner, repo.name] });
              qc.invalidateQueries({ queryKey: ["repo-stats", repo.id] });
              qc.invalidateQueries({ queryKey: ["owner-profile", owner] });
            }}
          />
        )}
        {activeTab === "issues" && <IssuesTab repoId={repo.id} />}
        {activeTab === "pulls" && <PullsTab repo={repo} isOwner={isOwner} />}
        {activeTab === "commits" && <CommitsTab repoId={repo.id} />}
        {activeTab === "settings" && isOwner && <SettingsTab repo={repo} owner={owner} />}
      </main>

      <Footer />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  CODE TAB                                  */
/* -------------------------------------------------------------------------- */

interface CodeTabProps {
  repo: any;
  filesMeta: RepoFileMeta[];
  loadingFiles: boolean;
  isOwner: boolean;
  authorId: string | undefined;
  onSaved: () => void;
}

function CodeTab({ repo, filesMeta, loadingFiles, isOwner, authorId, onSaved }: CodeTabProps) {
  const qc = useQueryClient();
  const [activeBranch, setActiveBranch] = useState(repo.default_branch || "main");
  const [activePath, setActivePath] = useState<string | null>(null);
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"code" | "preview">("code");
  const [lineEnding, setLineEnding] = useState<"LF" | "CRLF">("LF");
  const [wordWrap, setWordWrap] = useState(false);

  // File filtering & creation states
  const [fileFilter, setFileFilter] = useState("");
  const [filterActive, setFilterActive] = useState(false);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const fileUploadRef = useRef<HTMLInputElement>(null);

  // Staged dirty edits in memory: path -> { content, is_binary }
  const [dirtyFiles, setDirtyFiles] = useState<
    Record<string, { content: string; is_binary: boolean }>
  >({});
  const [commitOpen, setCommitOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [busyCommit, setBusyCommit] = useState(false);

  // Default active file to README.md if present
  useEffect(() => {
    if (!activePath && filesMeta.length > 0) {
      const readme = filesMeta.find((f) => /^readme(\.md|\.txt)?$/i.test(f.path));
      if (readme) {
        setActivePath(readme.path);
        setViewMode("preview");
      } else {
        setActivePath(filesMeta[0]?.path ?? null);
      }
    }
  }, [filesMeta, activePath]);

  // Keyboard shortcut 't' to focus file filter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "t" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        setFilterActive(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Filtered files list for search
  const visibleFiles = useMemo(() => {
    if (!fileFilter.trim()) return filesMeta;
    return filesMeta.filter((f) => f.path.toLowerCase().includes(fileFilter.toLowerCase().trim()));
  }, [filesMeta, fileFilter]);

  // Hierarchical file tree from metadata
  const tree = useMemo(() => {
    return buildTree(visibleFiles);
  }, [visibleFiles]);

  // On demand single-file content query (Cached with TanStack Query)
  const { data: fileContent = "", isLoading: loadingFileContent } = useQuery({
    queryKey: ["file-content", repo.id, activePath],
    enabled: !!activePath && !dirtyFiles[activePath],
    queryFn: () => (activePath ? fetchFileContent(repo.id, activePath) : Promise.resolve("")),
    staleTime: 1000 * 60 * 5,
  });

  const currentContent = activePath ? (dirtyFiles[activePath]?.content ?? fileContent) : "";

  const activeMeta = filesMeta.find((f) => f.path === activePath);
  const isBinary = activeMeta?.is_binary ?? false;
  const isMarkdown = !!(activePath && activePath.toLowerCase().endsWith(".md"));
  const isCurrentFileDirty = !!(activePath && dirtyFiles[activePath]);

  useEffect(() => {
    if (fileContent) {
      setLineEnding(fileContent.includes("\r\n") ? "CRLF" : "LF");
    }
  }, [fileContent, activePath]);

  function toggleLineEnding() {
    const nextEnding = lineEnding === "LF" ? "CRLF" : "LF";
    setLineEnding(nextEnding);
    if (activePath && currentContent) {
      const converted =
        nextEnding === "CRLF"
          ? currentContent.replace(/\r?\n/g, "\r\n")
          : currentContent.replace(/\r\n/g, "\n");
      setDirtyFiles((prev) => ({
        ...prev,
        [activePath]: { content: converted, is_binary: isBinary },
      }));
      toast.success(`Converted line endings to ${nextEnding}`);
    }
  }

  function cancelCurrentFileChanges() {
    if (!activePath || !dirtyFiles[activePath]) return;
    setDirtyFiles((prev) => {
      const next = { ...prev };
      delete next[activePath];
      return next;
    });
    toast.info(`Discarded unsaved changes for ${activePath}`);
  }

  function handleCreateFile(e: React.FormEvent) {
    e.preventDefault();
    const cleanPath = newFileName.trim().replace(/^\/+/, "");
    if (!cleanPath) return void toast.error("File name is required");

    setDirtyFiles((prev) => ({
      ...prev,
      [cleanPath]: { content: "", is_binary: false },
    }));
    setActivePath(cleanPath);
    setViewMode("code");
    setNewFileOpen(false);
    setNewFileName("");
    toast.success(`Created new file ${cleanPath} (uncommitted)`);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const staged: Record<string, { content: string; is_binary: boolean }> = {};
    for (const f of Array.from(files)) {
      const { content, isBinary } = await readUploadedFile(f);
      staged[f.name] = { content, is_binary: isBinary };
    }

    setDirtyFiles((prev) => ({ ...prev, ...staged }));
    const first = Object.keys(staged)[0];
    if (first) setActivePath(first);
    toast.success(`Staged ${Object.keys(staged).length} file(s) for commit`);
  }

  const hasChanges = Object.keys(dirtyFiles).length > 0;

  function handleContentChange(val: string | undefined) {
    if (!activePath) return;
    setDirtyFiles((prev) => ({
      ...prev,
      [activePath]: { content: val || "", is_binary: false },
    }));
  }

  async function handleCommit() {
    if (!commitMessage.trim()) return void toast.error("Commit message is required");
    const filesToCommit = Object.entries(dirtyFiles).map(([p, v]) => ({
      path: p,
      content: v.content,
      is_binary: v.is_binary,
    }));
    if (filesToCommit.length === 0) return void toast.error("No changed files to commit");

    setBusyCommit(true);

    try {
      // 1. Commit via authenticated atomic server endpoint
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const res = await fetch("/api/repo/commit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({
          repoId: repo.id,
          message: commitMessage.trim(),
          files: filesToCommit,
          expectedHeadSha: repo.head_sha || undefined,
        }),
      });

      const resData = await res.json();
      if (!res.ok || resData.error) {
        throw new Error(resData.error || "Failed to commit changes");
      }

      // 2. Immediately update TanStack Query cache for all edited files so editor content never reverts
      for (const [p, v] of Object.entries(dirtyFiles)) {
        qc.setQueryData(["file-content", repo.id, p], v.content);
      }

      toast.success(`Committed ${filesToCommit.length} file(s)`);
      setDirtyFiles({});
      setCommitOpen(false);
      setCommitMessage("");

      // 3. Trigger immediate cache invalidation for all related queries
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Failed to commit changes");
    } finally {
      setBusyCommit(false);
    }
  }

  const renderNode = (n: TreeNode, depth: number): React.ReactNode => {
    const isOpen = openFolders.has(n.path);
    const isFileActive = activePath === n.path;
    const isDirty = !!dirtyFiles[n.path];

    return (
      <div key={n.type + n.path}>
        <div
          className={`group flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-muted/70 ${
            isFileActive ? "bg-accent font-medium text-accent-foreground" : "text-foreground"
          }`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => {
            if (n.type === "folder") {
              setOpenFolders((s) => {
                const next = new Set(s);
                next.has(n.path) ? next.delete(n.path) : next.add(n.path);
                return next;
              });
            } else {
              setActivePath(n.path);
              setViewMode(n.path.toLowerCase().endsWith(".md") ? "preview" : "code");
              setMobileDrawerOpen(false);
            }
          }}
        >
          <div className="flex items-center gap-1.5 truncate">
            {n.type === "folder" ? (
              <>
                {isOpen ? (
                  <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
                {isOpen ? (
                  <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary" />
                ) : (
                  <Folder className="h-3.5 w-3.5 shrink-0 text-primary" />
                )}
              </>
            ) : (
              <FileIcon className="ml-3 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">{n.name}</span>
          </div>

          {isDirty && (
            <span className="h-2 w-2 rounded-full bg-warning shrink-0" title="Modified" />
          )}
        </div>
        {n.type === "folder" && isOpen && n.children?.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Hidden file upload input */}
      <input
        type="file"
        multiple
        ref={fileUploadRef}
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* TOP WORKSPACE CONTROLS (GitHub parity) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {/* Mobile Files toggle button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMobileDrawerOpen(true)}
            className="h-8 gap-1.5 text-xs md:hidden"
          >
            <PanelLeft className="h-3.5 w-3.5" />
            <span>Files</span>
          </Button>

          {/* Branch selector */}
          <BranchSwitcher
            repoId={repo.id}
            currentBranch={activeBranch}
            onSelectBranch={setActiveBranch}
            isOwner={isOwner}
          />

          {/* Add file button (+) */}
          {isOwner && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" title="Add file">
                  <FilePlus className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuItem onClick={() => setNewFileOpen(true)}>
                  Create new file
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => fileUploadRef.current?.click()}>
                  Upload files
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Go to file search trigger */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFilterActive(!filterActive)}
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            title="Go to file (t)"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Go to file</span>
            <kbd className="hidden sm:inline-block rounded border border-border bg-muted px-1 font-mono text-[10px]">
              t
            </kbd>
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {hasChanges && isOwner && (
            <Button
              size="sm"
              onClick={() => setCommitOpen(true)}
              className="h-8 gap-1.5 text-xs font-semibold bg-success hover:bg-success/90 text-success-foreground shadow-xs"
            >
              <GitCommit className="h-3.5 w-3.5" />
              <span>Commit changes ({Object.keys(dirtyFiles).length})</span>
            </Button>
          )}

          <CloneDropdown owner={repo.profiles?.username} repoName={repo.name} />
        </div>
      </div>

      {/* REPOSITORY WORKSPACE GRID (Image 1 Split View) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-12 rounded-xl border border-border bg-card overflow-hidden shadow-xs min-h-[580px]">
        {/* DESKTOP LEFT EXPLORER (3 cols / 260px) */}
        <aside className="hidden md:flex md:col-span-3 flex-col border-r border-border bg-muted/20 p-2 overflow-y-auto max-h-[720px]">
          <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Files</span>
            <span className="text-[10px] font-mono lowercase">{filesMeta.length} items</span>
          </div>

          {filterActive && (
            <div className="my-1.5 px-1">
              <Input
                placeholder="Find a file..."
                value={fileFilter}
                onChange={(e) => setFileFilter(e.target.value)}
                autoFocus
                className="h-7 text-xs bg-background"
              />
            </div>
          )}

          <div className="mt-1 space-y-0.5">
            {loadingFiles ? (
              <div className="p-4 space-y-2">
                <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
                <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
                <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
              </div>
            ) : tree.length > 0 ? (
              tree.map((n) => renderNode(n, 0))
            ) : (
              <p className="p-4 text-xs text-muted-foreground">No matching files.</p>
            )}
          </div>
        </aside>

        {/* MOBILE SLIDE-OVER EXPLORER DRAWER */}
        <Sheet open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
          <SheetContent side="left" className="w-72 p-4">
            <SheetHeader className="text-left pb-3 border-b border-border">
              <SheetTitle className="text-sm font-semibold">Repository Files</SheetTitle>
            </SheetHeader>
            <div className="my-2">
              <Input
                placeholder="Filter files..."
                value={fileFilter}
                onChange={(e) => setFileFilter(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="mt-2 space-y-0.5 overflow-y-auto max-h-[80vh]">
              {tree.map((n) => renderNode(n, 0))}
            </div>
          </SheetContent>
        </Sheet>

        {/* RIGHT CODE VIEWER / EDITOR (9 cols) */}
        <div className="col-span-1 md:col-span-9 flex flex-col min-h-[580px] bg-background">
          {activePath ? (
            <div className="flex flex-col h-full">
              {/* File header status line (GitHub Breadcrumb + Controls) */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2 text-xs">
                {/* Left: Breadcrumb */}
                <div className="flex items-center gap-1.5 font-mono text-xs truncate">
                  <span className="font-semibold text-foreground">{repo.name}</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="font-medium text-foreground truncate">{activePath}</span>
                  <span className="hidden sm:inline text-muted-foreground text-[11px] ml-1">
                    in {repo.default_branch || "main"}
                  </span>
                  {currentContent.startsWith("version https://git-lfs.github.com/spec/v1") && (
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-sky-500/10 text-sky-500 border-sky-500/30"
                    >
                      Git LFS
                    </Badge>
                  )}
                </div>

                {/* Right: Actions & settings */}
                <div className="flex items-center gap-2 shrink-0">
                  {isCurrentFileDirty && isOwner && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={cancelCurrentFileChanges}
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                      >
                        Cancel changes
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setCommitOpen(true)}
                        className="h-7 px-2.5 text-xs font-semibold bg-success hover:bg-success/90 text-success-foreground"
                      >
                        Commit changes...
                      </Button>
                    </>
                  )}

                  {isMarkdown && (
                    <div className="flex rounded-md border border-border p-0.5 bg-background">
                      <button
                        type="button"
                        onClick={() => setViewMode("code")}
                        className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                          viewMode === "code"
                            ? "bg-primary text-primary-foreground font-semibold"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode("preview")}
                        className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                          viewMode === "preview"
                            ? "bg-primary text-primary-foreground font-semibold"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Preview
                      </button>
                    </div>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      navigator.clipboard.writeText(currentContent);
                      toast.success("File content copied");
                    }}
                  >
                    <Copy className="h-3 w-3 mr-1" /> Copy
                  </Button>
                </div>
              </div>

              {/* Editor / viewer canvas */}
              <div className="flex-1 relative min-h-[500px]">
                {loadingFileContent && !currentContent ? (
                  <div className="flex h-full items-center justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : currentContent.startsWith("version https://git-lfs.github.com/spec/v1") ? (
                  <div className="flex h-full flex-col items-center justify-center p-8 text-center space-y-4">
                    <div className="h-12 w-12 rounded-full bg-sky-500/10 text-sky-500 flex items-center justify-center">
                      <HardDrive className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold text-foreground">Stored with Git LFS</h4>
                      <p className="text-xs text-muted-foreground font-mono">
                        SHA-256:{" "}
                        {currentContent.match(/oid sha256:([0-9a-fA-F]{64})/)?.[1] || "..."}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Size:{" "}
                        {(
                          (Number(currentContent.match(/size (\d+)/)?.[1]) || 0) /
                          1024 /
                          1024
                        ).toFixed(2)}{" "}
                        MB
                      </p>
                    </div>
                    <a
                      href={`/api/public/git/${repo.profiles?.username}/${repo.name}/info/lfs/objects/${currentContent.match(/oid sha256:([0-9a-fA-F]{64})/)?.[1]}`}
                      download
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Download raw LFS file</span>
                    </a>
                  </div>
                ) : isBinary ? (
                  <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground">
                    <p className="text-xs">Binary file preview not supported directly.</p>
                  </div>
                ) : viewMode === "preview" && isMarkdown ? (
                  <div className="p-6 overflow-y-auto max-h-[640px] bg-background">
                    <MarkdownRenderer content={currentContent} />
                  </div>
                ) : (
                  <CodeEditorLazy
                    value={currentContent}
                    language={languageFor(activePath)}
                    path={activePath}
                    readOnly={!isOwner}
                    onChange={handleContentChange}
                  />
                )}
              </div>

              {/* Bottom status bar with line endings, encoding, wrap */}
              <div className="flex items-center justify-between border-t border-border bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground font-mono">
                <div className="flex items-center gap-3">
                  <span>Spaces: 2</span>
                  <span>UTF-8</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setWordWrap(!wordWrap)}
                    className="hover:text-foreground transition-colors cursor-pointer"
                  >
                    {wordWrap ? "Wrap" : "No wrap"}
                  </button>
                  <button
                    type="button"
                    onClick={toggleLineEnding}
                    title="Click to toggle LF/CRLF"
                    className="rounded px-1.5 py-0.5 font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    {lineEnding}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center text-muted-foreground text-xs">
              Select a file from the explorer to view its contents.
            </div>
          )}
        </div>
      </div>

      {/* NEW FILE DIALOG */}
      <Dialog open={newFileOpen} onOpenChange={setNewFileOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Create new file</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateFile} className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">File path</Label>
              <Input
                placeholder="e.g. src/index.ts or docs/guide.md"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                className="h-8 text-xs font-mono"
                autoFocus
                required
              />
            </div>
            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNewFileOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!newFileName.trim()}>
                Create file
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* COMMIT DIALOG */}
      <Dialog open={commitOpen} onOpenChange={setCommitOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Commit changes</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Commit message</Label>
              <Input
                placeholder="Update file"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="rounded-lg border border-border bg-muted/40 p-2.5 space-y-1">
              <p className="text-[11px] font-semibold text-muted-foreground">Changed files:</p>
              {Object.keys(dirtyFiles).map((p) => (
                <p key={p} className="font-mono text-xs text-foreground truncate">
                  &bull; {p}
                </p>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCommitOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={busyCommit || !commitMessage.trim()}
              onClick={handleCommit}
              className="bg-success hover:bg-success/90 text-success-foreground"
            >
              {busyCommit ? "Committing..." : "Commit directly to main"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                               CLONE DROPDOWN                               */
/* -------------------------------------------------------------------------- */

function CloneDropdown({ owner, repoName }: { owner: string; repoName: string }) {
  const [copied, setCopied] = useState(false);
  const cloneUrl = `https://gitbowl.zone.id/${owner}/${repoName}.git`;

  function copyClone() {
    navigator.clipboard.writeText(cloneUrl);
    setCopied(true);
    toast.success("Clone URL copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          className="h-8 gap-1.5 px-3 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <Code2 className="h-3.5 w-3.5" />
          <span>Code</span>
          <ChevronDown className="h-3 w-3 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-4 space-y-3">
        <div className="flex items-center justify-between text-xs font-semibold text-foreground">
          <span>Clone with HTTPS</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 p-1.5">
          <Input
            readOnly
            value={cloneUrl}
            className="h-7 border-none bg-transparent font-mono text-[11px] shadow-none focus-visible:ring-0"
          />
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={copyClone}>
            {copied ? (
              <Check className="h-3.5 w-3.5 text-success" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
        <div className="rounded-md border border-primary/20 bg-primary/5 p-2 text-[11px] text-muted-foreground flex items-start gap-1.5">
          <KeyRound className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
          <span>
            Use your GitBowl username and account password (or Personal Access Token) when prompted.
          </span>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* -------------------------------------------------------------------------- */
/*                               SHARE & FORK                                 */
/* -------------------------------------------------------------------------- */

function ShareButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8 gap-1 text-xs"
      onClick={async () => {
        const url = window.location.href.split("?")[0] ?? "";
        if (navigator.share) await navigator.share({ url }).catch(() => {});
        else {
          await navigator.clipboard.writeText(url);
          toast.success("Link copied to clipboard");
        }
      }}
    >
      <Share2 className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Share</span>
    </Button>
  );
}

function ForkButton({ repo, isOwner }: { repo: any; isOwner: boolean }) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(repo.name);
  const [busy, setBusy] = useState(false);

  const startFork = () => {
    if (!user) return void toast.error("Sign in first");
    setName(isOwner ? `${repo.name}-copy` : repo.name);
    setOpen(true);
  };

  const submit = async () => {
    if (!profile) return;
    setBusy(true);
    try {
      await copyRepository({
        sourceRepoId: repo.id,
        newOwnerId: profile.id,
        newName: name,
        description: repo.description,
        isFork: true,
      });
      toast.success("Fork created successfully");
      navigate({ to: "/$owner/$repo", params: { owner: profile.username, repo: name } });
      setOpen(false);
    } catch (e: any) {
      toast.error(
        e.message?.includes("duplicate")
          ? "You already have a repository with that name"
          : e.message,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={startFork} className="h-8 gap-1.5 text-xs">
        <GitFork className="h-3.5 w-3.5 text-muted-foreground" />
        <span>Fork</span>
        <span className="ml-1 rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-mono">
          {repo.forks_count || 0}
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Create a new fork</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-xs">Repository name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value.replace(/[^\w.-]/g, "-"))}
              className="h-8 text-xs font-mono"
            />
          </div>
          <DialogFooter>
            <Button
              size="sm"
              onClick={submit}
              disabled={busy || !name}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {busy ? "Forking..." : "Create fork"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 COMMITS TAB                                */
/* -------------------------------------------------------------------------- */

function CommitsTab({ repoId }: { repoId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["commits", repoId],
    queryFn: async () => {
      const { data } = await supabase
        .from("commits")
        .select("id, message, created_at, profiles(username)")
        .eq("repo_id", repoId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    staleTime: 1000 * 30,
  });

  if (isLoading) {
    return (
      <div className="space-y-2 py-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-card border border-border animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
      {data.map((c: any) => (
        <div key={c.id} className="flex items-center justify-between px-4 py-3 text-xs">
          <div className="space-y-0.5 min-w-0">
            <p className="font-semibold text-foreground truncate">{c.message}</p>
            <p className="text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">
                {c.profiles?.username || "developer"}
              </span>{" "}
              committed {timeAgo(c.created_at)}
            </p>
          </div>
          <span className="rounded bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
            {c.id.slice(0, 7)}
          </span>
        </div>
      ))}
      {data.length === 0 && (
        <p className="p-8 text-center text-xs text-muted-foreground">No commits recorded yet.</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 ISSUES TAB                                 */
/* -------------------------------------------------------------------------- */

function IssuesTab({ repoId }: { repoId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: issues = [], isLoading } = useQuery({
    queryKey: ["issues", repoId],
    queryFn: async () => {
      const { data } = await supabase
        .from("issues")
        .select("id, title, state, created_at, profiles(username)")
        .eq("repo_id", repoId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    staleTime: 1000 * 30,
  });

  async function handleCreateIssue() {
    if (!title.trim()) return void toast.error("Title is required");
    setBusy(true);
    try {
      const nextNum = (issues?.length ?? 0) + 1;
      await supabase.from("issues").insert({
        repo_id: repoId,
        author_id: user?.id ?? null,
        number: nextNum,
        title: title.trim(),
        body: body.trim(),
        state: "open",
      });
      toast.success("Issue created");
      setTitle("");
      setBody("");
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["issues", repoId] });
    } catch (e: any) {
      toast.error(e.message || "Failed to create issue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Issues</h3>
        {user && (
          <Button size="sm" onClick={() => setCreating(true)} className="h-8 text-xs">
            New issue
          </Button>
        )}
      </div>

      {creating && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <Input
            placeholder="Issue title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-8 text-xs font-semibold"
          />
          <Textarea
            placeholder="Leave a comment (Markdown supported)"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-[100px] text-xs font-mono"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={busy || !title.trim()} onClick={handleCreateIssue}>
              {busy ? "Submitting..." : "Submit new issue"}
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
        {issues.map((i: any) => (
          <div key={i.id} className="flex items-center gap-3 px-4 py-3 text-xs">
            <CircleDot className="h-4 w-4 text-success shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground truncate">{i.title}</p>
              <p className="text-[11px] text-muted-foreground">
                opened {timeAgo(i.created_at)} by {i.profiles?.username || "user"}
              </p>
            </div>
          </div>
        ))}
        {issues.length === 0 && !isLoading && (
          <p className="p-8 text-center text-xs text-muted-foreground">No open issues found.</p>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                               BRANCH SWITCHER                              */
/* -------------------------------------------------------------------------- */

function BranchSwitcher({
  repoId,
  currentBranch,
  onSelectBranch,
  isOwner,
}: {
  repoId: string;
  currentBranch: string;
  onSelectBranch: (b: string) => void;
  isOwner: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const qc = useQueryClient();

  const { data: branches = [] } = useQuery({
    queryKey: ["repo-branches", repoId],
    queryFn: async () => {
      const res = await fetch(`/api/repo/branches?repoId=${repoId}`);
      if (!res.ok) return [];
      const json = await res.json();
      return json.branches || [];
    },
    staleTime: 1000 * 30,
  });

  const filtered = branches.filter((b: any) =>
    b.name.toLowerCase().includes(search.toLowerCase().trim()),
  );

  const exactMatch = branches.some(
    (b: any) => b.name.toLowerCase() === search.toLowerCase().trim(),
  );

  async function handleCreateBranch() {
    if (!search.trim()) return;
    setCreating(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token || "";
      const res = await fetch("/api/repo/branches", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repoId,
          branchName: search.trim(),
        }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Failed to create branch");
      toast.success(`Created branch "${search.trim()}"`);
      qc.invalidateQueries({ queryKey: ["repo-branches", repoId] });
      onSelectBranch(search.trim());
      setOpen(false);
      setSearch("");
    } catch (e: any) {
      toast.error(e.message || "Failed to create branch");
    } finally {
      setCreating(false);
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-semibold">
          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{currentBranch}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-2 text-xs">
        <div className="font-semibold px-2 py-1 text-muted-foreground text-[11px]">
          Switch branches / tags
        </div>
        <div className="px-1 py-1">
          <Input
            placeholder="Find or create a branch..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 text-xs"
          />
        </div>
        <div className="max-h-48 overflow-y-auto mt-1 divide-y divide-border/40">
          {filtered.map((b: any) => (
            <button
              key={b.ref}
              type="button"
              onClick={() => {
                onSelectBranch(b.name);
                setOpen(false);
              }}
              className="w-full flex items-center justify-between px-2 py-1.5 text-left hover:bg-muted/70 rounded transition-colors text-xs"
            >
              <div className="flex items-center gap-2 truncate">
                {b.name === currentBranch && <Check className="h-3 w-3 text-primary shrink-0" />}
                <span
                  className={
                    b.name === currentBranch
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground"
                  }
                >
                  {b.name}
                </span>
                {b.isDefault && (
                  <Badge
                    variant="outline"
                    className="text-[9px] py-0 px-1 border-muted-foreground/30"
                  >
                    default
                  </Badge>
                )}
              </div>
            </button>
          ))}
          {search.trim() && !exactMatch && isOwner && (
            <button
              type="button"
              disabled={creating}
              onClick={handleCreateBranch}
              className="w-full text-left px-2 py-2 text-xs text-primary hover:bg-muted/50 rounded font-medium flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>
                Create branch <strong>{search.trim()}</strong> from {currentBranch}
              </span>
            </button>
          )}
          {filtered.length === 0 && !search.trim() && (
            <div className="p-3 text-center text-muted-foreground text-xs">No branches found</div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  PULLS TAB                                 */
/* -------------------------------------------------------------------------- */

function PullsTab({ repo, isOwner }: { repo: any; isOwner: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filterState, setFilterState] = useState<"open" | "closed" | "all">("open");
  const [newPrOpen, setNewPrOpen] = useState(false);
  const [prTitle, setPrTitle] = useState("");
  const [prBody, setPrBody] = useState("");
  const [sourceBranch, setSourceBranch] = useState("");
  const [targetBranch, setTargetBranch] = useState(repo.default_branch || "main");
  const [creating, setCreating] = useState(false);
  const [selectedPr, setSelectedPr] = useState<any | null>(null);
  const [busyMerge, setBusyMerge] = useState(false);

  // Fetch branches for PR creation
  const { data: branches = [] } = useQuery({
    queryKey: ["repo-branches", repo.id],
    queryFn: async () => {
      const res = await fetch(`/api/repo/branches?repoId=${repo.id}`);
      if (!res.ok) return [];
      const json = await res.json();
      return json.branches || [];
    },
    staleTime: 1000 * 30,
  });

  // Fetch repo PRs
  const { data: pullRequests = [], isLoading } = useQuery({
    queryKey: ["repo-prs", repo.id, filterState],
    queryFn: async () => {
      const res = await fetch(`/api/repo/pulls?repoId=${repo.id}&state=${filterState}`);
      if (!res.ok) return [];
      const json = await res.json();
      return json.pullRequests || [];
    },
    staleTime: 1000 * 15,
  });

  async function handleCreatePr() {
    if (!prTitle.trim()) return void toast.error("Title is required");
    if (!sourceBranch) return void toast.error("Source branch is required");

    setCreating(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token || "";
      const res = await fetch("/api/repo/pulls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repoId: repo.id,
          title: prTitle.trim(),
          body: prBody.trim(),
          sourceBranch,
          targetBranch,
        }),
      });

      const resJson = await res.json();
      if (!res.ok) throw new Error(resJson.error || "Failed to create pull request");

      toast.success(`Pull request #${resJson.pullRequest.number} created!`);
      qc.invalidateQueries({ queryKey: ["repo-prs", repo.id] });
      setNewPrOpen(false);
      setPrTitle("");
      setPrBody("");
    } catch (e: any) {
      toast.error(e.message || "Failed to create pull request");
    } finally {
      setCreating(false);
    }
  }

  async function handleMergePr(prId: string) {
    setBusyMerge(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token || "";
      const res = await fetch("/api/repo/pull-merge", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prId,
          method: "squash",
        }),
      });

      const resJson = await res.json();
      if (!res.ok) throw new Error(resJson.error || "Failed to merge pull request");

      toast.success("Pull request successfully merged!");
      if (resJson.closedIssues && resJson.closedIssues.length > 0) {
        toast.info(`Auto-closed linked issue(s): #${resJson.closedIssues.join(", #")}`);
      }

      qc.invalidateQueries({ queryKey: ["repo-prs", repo.id] });
      qc.invalidateQueries({ queryKey: ["issues", repo.id] });
      qc.invalidateQueries({ queryKey: ["repo-commits", repo.id] });
      setSelectedPr(null);
    } catch (e: any) {
      toast.error(e.message || "Merge failed");
    } finally {
      setBusyMerge(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-muted/40 rounded-lg border border-border">
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
            <CircleCheck className="h-3.5 w-3.5 mr-1.5 text-purple-500" />
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

        {user && (
          <Button
            size="sm"
            onClick={() => {
              if (branches.length > 1 && !sourceBranch) {
                const other = branches.find((b: any) => !b.isDefault);
                if (other) setSourceBranch(other.name);
              }
              setNewPrOpen(true);
            }}
            className="h-8 gap-1.5 text-xs font-semibold bg-success hover:bg-success/90 text-success-foreground"
          >
            <GitPullRequest className="h-3.5 w-3.5" />
            <span>New pull request</span>
          </Button>
        )}
      </div>

      {/* PRs List */}
      <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden text-xs">
        {isLoading && (
          <div className="p-8 text-center text-muted-foreground">Loading pull requests...</div>
        )}

        {!isLoading &&
          pullRequests.map((pr: any) => (
            <div
              key={pr.id}
              onClick={() => setSelectedPr(pr)}
              className="flex items-start justify-between p-4 hover:bg-muted/40 transition-colors cursor-pointer"
            >
              <div className="flex items-start gap-3">
                {pr.state === "open" ? (
                  <GitPullRequest className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                ) : pr.state === "merged" ? (
                  <GitMerge className="h-4 w-4 text-purple-500 mt-0.5 shrink-0" />
                ) : (
                  <CircleCheck className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                )}

                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground text-sm hover:underline">
                      {pr.title}
                    </span>
                    <span className="text-muted-foreground font-mono">#{pr.number}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2">
                    <span>
                      opened {timeAgo(pr.created_at)} by {pr.profiles?.username || "author"}
                    </span>
                    <span>•</span>
                    <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">
                      {pr.source_branch} → {pr.target_branch}
                    </span>
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
          ))}

        {!isLoading && pullRequests.length === 0 && (
          <div className="p-12 text-center text-muted-foreground">
            <GitPullRequest className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="font-semibold text-foreground">
              No {filterState !== "all" ? filterState : ""} pull requests
            </p>
            <p className="mt-1">
              Pull requests let you tell others about changes you&apos;ve pushed to a branch in this
              repository.
            </p>
          </div>
        )}
      </div>

      {/* New PR Dialog */}
      <Dialog open={newPrOpen} onOpenChange={setNewPrOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <GitPullRequest className="h-4 w-4 text-emerald-500" />
              Open a new pull request
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2 text-xs">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border">
              <span className="text-muted-foreground">Compare:</span>
              <select
                value={sourceBranch}
                onChange={(e) => setSourceBranch(e.target.value)}
                className="bg-background border border-border rounded px-2 py-1 text-xs"
              >
                <option value="">Select source branch...</option>
                {branches.map((b: any) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
              <span className="text-muted-foreground">into</span>
              <span className="font-mono font-semibold px-2 py-1 bg-background rounded border border-border">
                {targetBranch}
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Title</label>
              <Input
                placeholder="e.g. Feature: Add user avatar support (fixes #1)"
                value={prTitle}
                onChange={(e) => setPrTitle(e.target.value)}
                className="text-xs h-8"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                Description (Markdown)
              </label>
              <Textarea
                placeholder="Describe your changes and include issue references (e.g. fixes #12)..."
                value={prBody}
                onChange={(e) => setPrBody(e.target.value)}
                className="min-h-[100px] text-xs font-mono"
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setNewPrOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={creating || !prTitle.trim() || !sourceBranch}
              onClick={handleCreatePr}
              className="bg-emerald-600 hover:bg-emerald-500"
            >
              {creating ? "Creating..." : "Create pull request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PR Detail Modal */}
      {selectedPr && (
        <Dialog open={!!selectedPr} onOpenChange={(open) => !open && setSelectedPr(null)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`text-[10px] capitalize ${
                    selectedPr.state === "open"
                      ? "border-emerald-600/30 text-emerald-500 bg-emerald-500/10"
                      : selectedPr.state === "merged"
                        ? "border-purple-600/30 text-purple-400 bg-purple-500/10"
                        : "border-border text-muted-foreground"
                  }`}
                >
                  {selectedPr.state}
                </Badge>
                <DialogTitle className="text-base font-bold">
                  {selectedPr.title}{" "}
                  <span className="text-muted-foreground font-normal">#{selectedPr.number}</span>
                </DialogTitle>
              </div>
              <div className="text-[11px] text-muted-foreground pt-1 flex items-center gap-2">
                <span>by {selectedPr.profiles?.username || "author"}</span>
                <span>•</span>
                <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">
                  {selectedPr.source_branch} into {selectedPr.target_branch}
                </span>
                <span>•</span>
                <span>{timeAgo(selectedPr.created_at)}</span>
              </div>
            </DialogHeader>

            <div className="space-y-4 py-3 text-xs">
              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <div className="prose prose-sm dark:prose-invert max-w-none text-xs">
                  {selectedPr.body ? (
                    <MarkdownRenderer content={selectedPr.body} />
                  ) : (
                    <span className="text-muted-foreground italic">No description provided.</span>
                  )}
                </div>
              </div>

              {/* Merge Actions for Maintainers */}
              {selectedPr.state === "open" && isOwner && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-emerald-600 dark:text-emerald-400 text-xs">
                      This branch has no conflicts and can be merged
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Merging will squash commits and close linked issues automatically.
                    </div>
                  </div>

                  <Button
                    size="sm"
                    disabled={busyMerge}
                    onClick={() => handleMergePr(selectedPr.id)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold shrink-0"
                  >
                    <GitMerge className="h-3.5 w-3.5 mr-1.5" />
                    {busyMerge ? "Merging..." : "Squash and merge"}
                  </Button>
                </div>
              )}

              {selectedPr.state === "merged" && (
                <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-3 flex items-center gap-2.5 text-xs text-purple-400">
                  <GitMerge className="h-4 w-4" />
                  <span>
                    Successfully merged into <strong>{selectedPr.target_branch}</strong> on{" "}
                    {new Date(selectedPr.merged_at || selectedPr.updated_at).toLocaleString()}.
                  </span>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setSelectedPr(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                SETTINGS TAB                                */
/* -------------------------------------------------------------------------- */

function SettingsTab({ repo, owner }: { repo: any; owner: string }) {
  const navigate = useNavigate();
  const [name, setName] = useState(repo.name);
  const [desc, setDesc] = useState(repo.description || "");
  const [isPrivate, setIsPrivate] = useState(repo.is_private);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("repositories")
        .update({
          name: name.trim(),
          description: desc.trim(),
          is_private: isPrivate,
          updated_at: new Date().toISOString(),
        })
        .eq("id", repo.id);
      if (error) throw error;
      toast.success("Repository settings updated");
      if (name.trim() !== repo.name) {
        navigate({ to: "/$owner/$repo", params: { owner, repo: name.trim() } });
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to update settings");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (
      !confirm(
        `Are you sure you want to delete ${owner}/${repo.name}? This action cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from("repositories").delete().eq("id", repo.id);
      if (error) throw error;
      toast.success("Repository deleted");
      navigate({ to: "/$owner", params: { owner }, search: { tab: "overview" } });
    } catch (e: any) {
      toast.error(e.message || "Failed to delete repository");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h3 className="text-base font-semibold text-foreground">General Settings</h3>
        <div className="space-y-1.5">
          <Label className="text-xs">Repository name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value.replace(/[^\w.-]/g, "-"))}
            className="h-8 text-xs font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Description</Label>
          <Input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="h-8 text-xs"
            placeholder="A short description of this repository"
          />
        </div>
        <div className="flex items-center justify-between pt-2">
          <div>
            <Label className="text-xs font-medium">Private repository</Label>
            <p className="text-[11px] text-muted-foreground">
              Only you and explicit collaborators can view this repository.
            </p>
          </div>
          <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
        </div>
        <div className="pt-2">
          <Button size="sm" disabled={busy} onClick={handleSave} className="text-xs">
            {busy ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </div>

      {/* GITBOWL PAGES SECTION */}
      <PagesSettingsCard repoId={repo.id} owner={owner} repoName={repo.name} />

      {/* WEBHOOKS SECTION */}
      <WebhooksSettingsCard repoId={repo.id} />

      {/* PERSONAL ACCESS TOKENS SECTION */}
      <TokenManager />

      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 space-y-3">
        <h3 className="text-sm font-semibold text-destructive">Danger Zone</h3>
        <p className="text-xs text-muted-foreground">
          Deleting a repository will permanently wipe all code, commits, and issues.
        </p>
        <Button
          variant="destructive"
          size="sm"
          disabled={busy}
          onClick={handleDelete}
          className="text-xs"
        >
          Delete this repository
        </Button>
      </div>
    </div>
  );
}

function TokenManager() {
  const { session } = useAuth();
  const [tokens, setTokens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [expiryDays, setExpiryDays] = useState("30");
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadTokens() {
    if (!session?.access_token) return;
    try {
      const res = await fetch("/api/auth/tokens", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      setTokens(data.tokens || []);
    } catch (err) {
      console.warn("Could not load tokens:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTokens();
  }, [session?.access_token]);

  async function handleCreateToken(e: React.FormEvent) {
    e.preventDefault();
    if (!tokenName.trim()) return void toast.error("Token name is required");
    if (!session?.access_token) return void toast.error("Not authenticated");

    setBusy(true);
    try {
      const res = await fetch("/api/auth/tokens", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name: tokenName.trim(),
          expires_in_days: Number(expiryDays),
          scopes: ["repo"],
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to create token");

      setGeneratedToken(data.token);
      setTokenName("");
      toast.success("Personal access token generated");
      void loadTokens();
    } catch (err: any) {
      toast.error(err.message || "Failed to create token");
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm("Are you sure you want to revoke this personal access token?")) return;
    if (!session?.access_token) return;

    try {
      const res = await fetch(`/api/auth/tokens?id=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        toast.success("Token revoked");
        void loadTokens();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke token");
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Personal Access Tokens</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Use personal access tokens to securely authenticate Git operations (clone, pull, push).
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)} className="h-8 text-xs gap-1.5">
          <KeyRound className="h-3.5 w-3.5" />
          <span>Generate token</span>
        </Button>
      </div>

      {/* Generated Token Alert */}
      {generatedToken && (
        <div className="rounded-lg border border-success/30 bg-success/10 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-success">
              Make sure to copy your personal access token now. You won’t be able to see it again!
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => {
                navigator.clipboard.writeText(generatedToken);
                toast.success("Token copied to clipboard");
              }}
            >
              <Copy className="h-3 w-3" /> Copy
            </Button>
          </div>
          <div className="p-2 rounded bg-background/90 font-mono text-xs text-foreground border border-border break-all">
            {generatedToken}
          </div>
        </div>
      )}

      {/* Token List */}
      <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
        {loading ? (
          <div className="p-4 text-xs text-muted-foreground">Loading tokens...</div>
        ) : tokens.length > 0 ? (
          tokens.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between p-3 text-xs">
              <div className="space-y-0.5">
                <p className="font-semibold text-foreground flex items-center gap-2">
                  <span>{t.name}</span>
                  <span className="font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {t.token_prefix}...
                  </span>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Created {new Date(t.created_at).toLocaleDateString()}
                  {t.expires_at
                    ? ` · Expires ${new Date(t.expires_at).toLocaleDateString()}`
                    : " · No expiry"}
                  {t.last_used_at ? ` · Last used ${timeAgo(t.last_used_at)}` : " · Never used"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-destructive hover:bg-destructive/10"
                onClick={() => handleRevoke(t.id)}
              >
                Revoke
              </Button>
            </div>
          ))
        ) : (
          <p className="p-4 text-xs text-muted-foreground text-center">
            No personal access tokens created yet.
          </p>
        )}
      </div>

      {/* Generate Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              Generate Personal Access Token
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateToken} className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Token description / name</Label>
              <Input
                placeholder="e.g. CLI git push"
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                className="h-8 text-xs"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Expiration</Label>
              <select
                value={expiryDays}
                onChange={(e) => setExpiryDays(e.target.value)}
                className="w-full h-8 rounded-md border border-input bg-background px-3 text-xs"
              >
                <option value="30">30 days</option>
                <option value="60">60 days</option>
                <option value="90">90 days</option>
                <option value="0">No expiration</option>
              </select>
            </div>
            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy || !tokenName.trim()}>
                {busy ? "Generating..." : "Generate token"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                            GITBOWL PAGES CARD                              */
/* -------------------------------------------------------------------------- */

function PagesSettingsCard({
  repoId,
  owner,
  repoName,
}: {
  repoId: string;
  owner: string;
  repoName: string;
}) {
  const { session } = useAuth();
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [branch, setBranch] = useState("main");
  const [path, setPath] = useState("/");
  const [busy, setBusy] = useState(false);

  const { data: config } = useQuery({
    queryKey: ["pages-config", repoId],
    queryFn: async () => {
      const res = await fetch(`/api/repo/pages-config?repoId=${repoId}`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.config;
    },
  });

  useEffect(() => {
    if (config) {
      setEnabled(!!config.is_enabled);
      setBranch(config.branch || "main");
      setPath(config.path || "/");
    }
  }, [config]);

  async function handleSave() {
    if (!session?.access_token) return;
    setBusy(true);
    try {
      const res = await fetch("/api/repo/pages-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          repoId,
          isEnabled: enabled,
          branch,
          path,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update Pages");
      toast.success(enabled ? "GitBowl Pages published" : "GitBowl Pages disabled");
      qc.invalidateQueries({ queryKey: ["pages-config", repoId] });
    } catch (e: any) {
      toast.error(e.message || "Failed to save Pages config");
    } finally {
      setBusy(false);
    }
  }

  const liveUrl = `/pages/${owner}/${repoName}/`;

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Globe className="h-4 w-4 text-emerald-500" />
            GitBowl Pages
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Host static HTML, CSS, and JavaScript sites directly from your repository.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {enabled && (
        <div className="space-y-4 pt-2 border-t border-border">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center justify-between text-xs">
            <span className="text-emerald-500 font-medium">Your site is live at:</span>
            <a
              href={liveUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-foreground font-semibold hover:underline flex items-center gap-1.5"
            >
              <span>{liveUrl}</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1">
              <Label className="text-xs">Publish Branch</Label>
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full h-8 rounded-md border border-input bg-background px-3 text-xs"
              >
                <option value="main">main</option>
                <option value="gh-pages">gh-pages</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Source Folder</Label>
              <select
                value={path}
                onChange={(e) => setPath(e.target.value)}
                className="w-full h-8 rounded-md border border-input bg-background px-3 text-xs"
              >
                <option value="/">/ (root)</option>
                <option value="/docs">/docs</option>
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="pt-2">
        <Button size="sm" disabled={busy} onClick={handleSave} className="text-xs">
          {busy ? "Saving..." : "Save Pages settings"}
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                            WEBHOOKS SETTINGS CARD                          */
/* -------------------------------------------------------------------------- */

function WebhooksSettingsCard({ repoId }: { repoId: string }) {
  const { session } = useAuth();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: webhooks = [] } = useQuery({
    queryKey: ["repo-webhooks", repoId],
    queryFn: async () => {
      if (!session?.access_token) return [];
      const res = await fetch(`/api/repo/webhooks?repoId=${repoId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return [];
      const json = await res.json();
      return json.webhooks || [];
    },
    enabled: !!session?.access_token,
  });

  async function handleAddWebhook(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return void toast.error("Payload URL is required");
    if (!session?.access_token) return;

    setBusy(true);
    try {
      const res = await fetch("/api/repo/webhooks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          repoId,
          url: url.trim(),
          secret: secret.trim(),
          events: ["push", "pull_request", "issues", "release"],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add webhook");
      toast.success("Webhook added successfully");
      qc.invalidateQueries({ queryKey: ["repo-webhooks", repoId] });
      setAddOpen(false);
      setUrl("");
      setSecret("");
    } catch (err: any) {
      toast.error(err.message || "Failed to add webhook");
    } finally {
      setBusy(false);
    }
  }

  async function handleTestPing(webhookId: string) {
    if (!session?.access_token) return;
    try {
      const res = await fetch("/api/repo/webhook-deliveries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ webhookId, action: "ping" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ping failed");
      toast.success(
        data.delivery?.success
          ? "Ping delivered successfully (HTTP 200)"
          : `Ping sent (status: ${data.delivery?.statusCode || "timeout"})`,
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to ping webhook");
    }
  }

  async function handleDeleteWebhook(webhookId: string) {
    if (!confirm("Are you sure you want to delete this webhook?")) return;
    if (!session?.access_token) return;

    try {
      const res = await fetch("/api/repo/webhooks", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ webhookId }),
      });
      if (res.ok) {
        toast.success("Webhook deleted");
        qc.invalidateQueries({ queryKey: ["repo-webhooks", repoId] });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to delete webhook");
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Radio className="h-4 w-4 text-emerald-500" />
            Webhooks
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Webhooks allow external services to be notified when certain events happen on GitBowl.
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} className="h-8 text-xs gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          <span>Add webhook</span>
        </Button>
      </div>

      <div className="rounded-lg border border-border divide-y divide-border overflow-hidden text-xs">
        {webhooks.map((hook: any) => (
          <div key={hook.id} className="p-4 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="font-mono font-medium text-foreground">{hook.url}</span>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                >
                  Active
                </Badge>
                <span className="text-[11px] text-muted-foreground">
                  Events: {hook.events?.join(", ") || "push"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => handleTestPing(hook.id)}
              >
                Test Ping
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-destructive hover:text-destructive"
                onClick={() => handleDeleteWebhook(hook.id)}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
        {webhooks.length === 0 && (
          <p className="p-4 text-xs text-muted-foreground text-center">
            No webhooks configured yet.
          </p>
        )}
      </div>

      {/* Add Webhook Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Add Webhook</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddWebhook} className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label className="text-xs">Payload URL</Label>
              <Input
                placeholder="https://example.com/webhooks"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="h-8 text-xs"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Secret (HMAC-SHA256)</Label>
              <Input
                type="password"
                placeholder="Optional shared secret key"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="h-8 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                Payloads will be signed with <code>X-GitBowl-Signature-256</code>.
              </p>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy || !url.trim()}>
                {busy ? "Adding..." : "Add webhook"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
