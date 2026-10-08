import { useState, useEffect } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  FolderGit2,
  DownloadCloud,
  CheckCircle2,
  Lock,
  Globe,
  Loader2,
  Search,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  RefreshCw,
  FileCode,
  Terminal,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { filesFromZip, readUploadedFile } from "@/lib/repo";
import { formatFriendlyErrorMessage } from "@/lib/unicode";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

const CLONE_STAGES = [
  {
    title: "Remote Git Handshake & Discovery",
    description: "Resolving repository endpoint, default branch HEAD, and remote refs.",
  },
  {
    title: "Tree Clone & Unpacking",
    description: "Cloning repository tree via Git CLI with single-branch shallow strategy.",
  },
  {
    title: "Unicode & NUL-Byte Sanitization",
    description:
      "Inspecting files for null bytes (\\u0000), normalizing text encoding, and preserving binaries in Base64.",
  },
  {
    title: "Adaptive Database Streaming",
    description:
      "Streaming files in optimized database chunks with automatic retry and conflict resolution.",
  },
  {
    title: "Manifest Synchronization & Finalization",
    description:
      "Creating initial commit log, materializing Git trees, and queuing cloud backup manifest.",
  },
];

export const Route = createFileRoute("/new")({
  validateSearch: (s: Record<string, unknown>): { tab?: string | undefined } => ({
    tab: typeof s["tab"] === "string" ? (s["tab"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "New repository — GitBowl" },
      {
        name: "description",
        content: "Create a new GitBowl repository or import an existing repository from GitHub.",
      },
      { property: "og:title", content: "New repository — GitBowl" },
      {
        property: "og:description",
        content: "Create or import a repository to GitBowl in seconds.",
      },
    ],
  }),
  component: NewRepo,
});

type GitHubRepoItem = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
};

function NewRepo() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();

  const [activeTab, setActiveTab] = useState<"create" | "import">(
    search.tab === "import" ? "import" : "create",
  );

  // Owner selection
  const [selectedOwner, setSelectedOwner] = useState<string>("personal");
  const [userOrgs, setUserOrgs] = useState<Array<{ id: string; name: string; slug: string }>>([]);

  // Manual create form states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [uploads, setUploads] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function loadOrgs() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.access_token) return;
      try {
        const res = await fetch("/api/orgs/", {
          headers: {
            Authorization: `Bearer ${sessionData.session.access_token}`,
          },
        });
        if (res.ok) {
          const json = await res.json();
          setUserOrgs(json.orgs || []);
        }
      } catch (err) {
        console.warn("Could not load orgs:", err);
      }
    }
    loadOrgs();
  }, [user]);

  // GitHub Import form states
  const [githubUrl, setGithubUrl] = useState("");
  const [importTargetName, setImportTargetName] = useState("");
  const [importPrivate, setImportPrivate] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importStatus, setImportStatus] = useState<string>("");
  const [importStep, setImportStep] = useState<number>(0);
  const [importProgress, setImportProgress] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    let timer: any;
    if (importBusy) {
      setElapsedSeconds(0);
      timer = setInterval(() => {
        setElapsedSeconds((s) => s + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [importBusy]);

  // GitHub user repos listing
  const [userRepos, setUserRepos] = useState<GitHubRepoItem[]>([]);
  const [loadingUserRepos, setLoadingUserRepos] = useState(false);
  const [repoFilter, setRepoFilter] = useState("");
  const [githubToken, setGithubToken] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("gitbowl_github_token");
    setGithubToken(token);
    if (token) {
      setLoadingUserRepos(true);
      fetch("https://api.github.com/user/repos?sort=updated&per_page=50", {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      })
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setUserRepos(data);
          }
        })
        .catch((err) => {
          console.warn("Could not fetch user GitHub repos:", err);
        })
        .finally(() => {
          setLoadingUserRepos(false);
        });
    }
  }, []);

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col justify-between">
        <Header />
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <h1 className="text-xl font-semibold">Sign in to create or import a repository</h1>
          <Button asChild className="mt-4">
            <Link to="/auth" search={{ redirect: "/new" }}>
              Sign in
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    try {
      const cleanName = name.trim().replace(/\s+/g, "-");
      const selectedOrg = userOrgs.find((o) => o.slug === selectedOwner);
      const targetOwnerSlug = selectedOrg ? selectedOrg.slug : profile.username;

      const { data: repo, error } = await supabase
        .from("repositories" as any)
        .insert({
          owner_id: profile.id,
          org_id: selectedOrg ? selectedOrg.id : null,
          name: cleanName,
          description: description.trim() || null,
          is_private: isPrivate,
        })
        .select()
        .single();
      if (error) throw error;

      const rows: {
        repo_id: string;
        path: string;
        content: string;
        is_binary: boolean;
        size: number;
      }[] = [];
      for (const file of uploads) {
        if (file.name.toLowerCase().endsWith(".zip")) {
          const entries = await filesFromZip(file);
          entries.forEach((e) =>
            rows.push({
              repo_id: (repo as any).id,
              path: e.path,
              content: e.content,
              is_binary: e.isBinary,
              size: e.content.length,
            }),
          );
        } else {
          const { content, isBinary } = await readUploadedFile(file);
          const filePath = ((file as any).webkitRelativePath || file.name)
            .replace(/\\/g, "/")
            .replace(/^\/+/, "");
          rows.push({
            repo_id: (repo as any).id,
            path: filePath,
            content,
            is_binary: isBinary,
            size: content.length,
          });
        }
      }
      if (rows.length) {
        const { data: sessData } = await supabase.auth.getSession();
        const token = sessData?.session?.access_token;
        const commitRes = await fetch("/api/repo/commit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: token ? `Bearer ${token}` : "",
          },
          body: JSON.stringify({
            repoId: (repo as any).id,
            message: "Initial upload",
            files: rows.map((r) => ({
              path: r.path,
              content: r.content,
              is_binary: r.is_binary,
            })),
          }),
        });

        if (!commitRes.ok) {
          const commitErr = await commitRes.json().catch(() => ({}));
          throw new Error(commitErr.error || "Failed to commit initial files");
        }
      } else {
        await supabase.from("commits").insert({
          repo_id: (repo as any).id,
          author_id: profile.id,
          message: "Create repository",
          changes: [],
        });
      }

      if (rows.length) {
        supabase.auth.getSession().then(({ data: sessData }) => {
          if (sessData?.session?.access_token) {
            fetch("/api/repo/sync-gdrive", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${sessData.session.access_token}`,
              },
              body: JSON.stringify({ repoId: (repo as any).id }),
            }).catch((e) => console.warn("[GDrive] Async sync trigger notice:", e));
          }
        });
      }

      toast.success("Repository created");
      navigate({
        to: "/$owner/$repo",
        params: { owner: targetOwnerSlug, repo: (repo as any).name },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create repository");
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(e?: React.FormEvent, directRepoUrl?: string) {
    if (e) e.preventDefault();
    if (!profile) return;

    const urlToImport = directRepoUrl || githubUrl;
    if (!urlToImport.trim()) {
      return void toast.error("Please enter a Git repository URL or select one from below");
    }

    setImportBusy(true);
    setImportError(null);
    setImportStep(0);
    setImportProgress(10);
    setImportStatus("Connecting & verifying remote repository...");

    // Progressive stage animations during clone & ingest
    const t1 = setTimeout(() => {
      setImportStep(1);
      setImportProgress(35);
      setImportStatus("Cloning repository tree via Git CLI...");
    }, 1200);

    const t2 = setTimeout(() => {
      setImportStep(2);
      setImportProgress(60);
      setImportStatus("Scanning files, normalizing null bytes & sanitizing Unicode...");
    }, 3800);

    const t3 = setTimeout(() => {
      setImportStep(3);
      setImportProgress(82);
      setImportStatus("Adaptive batch streaming files to database...");
    }, 7500);

    const t4 = setTimeout(() => {
      setImportStep(4);
      setImportProgress(94);
      setImportStatus("Finalizing repository manifest & cloud storage backup...");
    }, 12500);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch("/api/github/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({
          githubUrl: urlToImport.trim(),
          targetName: importTargetName.trim() || undefined,
          isPrivate: importPrivate,
          githubToken: githubToken || undefined,
          userId: profile?.id || user?.id,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to import Git repository");
      }

      setImportStep(4);
      setImportProgress(100);
      toast.success(`Successfully imported ${data.repoName} (${data.fileCount} files)!`);
      navigate({
        to: "/$owner/$repo",
        params: { owner: data.owner || profile.username, repo: data.repoName },
      });
    } catch (err: any) {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      const friendly = formatFriendlyErrorMessage(err.message || "Failed to import Git repository");
      setImportError(friendly);
      toast.error(friendly);
    } finally {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      setImportBusy(false);
      setImportStatus("");
    }
  }

  const filteredUserRepos = userRepos.filter((r) =>
    r.full_name.toLowerCase().includes(repoFilter.toLowerCase().trim()),
  );

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between">
      <Header />
      <div className="mx-auto w-full max-w-3xl px-4 py-10 flex-1">
        <div className="border-b border-border pb-4 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {activeTab === "create" ? "Create a new repository" : "Git Clone & Import"}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Repositories live at{" "}
              <span className="font-mono text-foreground font-medium">
                {profile?.username ?? "you"}/name
              </span>
              .
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex rounded-lg border border-border bg-muted/40 p-1 self-start sm:self-center">
            <button
              type="button"
              onClick={() => setActiveTab("create")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                activeTab === "create"
                  ? "bg-card text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FolderGit2 className="h-3.5 w-3.5" />
              <span>Blank / Upload</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("import")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                activeTab === "import"
                  ? "bg-card text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <DownloadCloud className="h-3.5 w-3.5" />
              <span>Git Clone & Import</span>
            </button>
          </div>
        </div>

        {activeTab === "create" ? (
          /* STANDARD CREATE FORM */
          <form
            onSubmit={create}
            className="panel rounded-xl border border-border bg-card p-6 space-y-5 shadow-xs"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="owner" className="text-xs">
                  Owner
                </Label>
                <select
                  id="owner"
                  value={selectedOwner}
                  onChange={(e) => setSelectedOwner(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-medium"
                >
                  <option value="personal">{profile?.username || "personal"} (Personal)</option>
                  {userOrgs.map((o) => (
                    <option key={o.id} value={o.slug}>
                      {o.name} (@{o.slug})
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="name" className="text-xs">
                  Repository name
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9._-]/g, "-"))}
                  placeholder="my-project"
                  required
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-xs">
                Description (optional)
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="A brief overview of your project..."
                className="text-xs"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3">
              <div>
                <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  {isPrivate ? <Lock className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
                  {isPrivate ? "Private repository" : "Public repository"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {isPrivate
                    ? "Only you and designated collaborators can view this repository."
                    : "Anyone on the Internet can view, clone, and read this repository."}
                </div>
              </div>
              <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="files" className="text-xs">
                Upload initial files or a .zip archive (optional)
              </Label>
              <Input
                id="files"
                type="file"
                multiple
                onChange={(e) => setUploads(Array.from(e.target.files ?? []))}
                className="text-xs file:text-xs"
              />
              {uploads.length ? (
                <p className="text-xs text-primary font-medium">
                  {uploads.length} file(s) selected
                </p>
              ) : null}
            </div>
            <Button
              type="submit"
              disabled={busy || !name.trim()}
              className="h-9 text-xs font-semibold"
            >
              {busy ? "Creating…" : "Create repository"}
            </Button>
          </form>
        ) : (
          /* GITHUB IMPORT FORM */
          <div className="space-y-6">
            <form
              onSubmit={(e) => handleImport(e)}
              className="panel rounded-xl border border-border bg-card p-6 space-y-5 shadow-xs"
            >
              <div className="space-y-1.5">
                <Label htmlFor="gh-url" className="text-xs">
                  Git Repository URL (GitHub, GitLab, Bitbucket, Codeberg, or any Git clone URL)
                </Label>
                <div className="relative">
                  <Input
                    id="gh-url"
                    value={githubUrl}
                    onChange={(e) => {
                      const val = e.target.value;
                      setGithubUrl(val);
                      // Universal auto-extract repo name from any Git URL
                      const clean = val
                        .trim()
                        .replace(/\.git$/i, "")
                        .replace(/\/+$/, "");
                      const parts = clean.split(/[/:]/);
                      const last = parts[parts.length - 1];
                      if (last && !last.includes(".")) {
                        setImportTargetName(last.toLowerCase().replace(/[^a-z0-9_.-]/g, "-"));
                      }
                    }}
                    placeholder="e.g. https://github.com/owner/repo, https://gitlab.com/owner/repo.git, or owner/repo"
                    required
                    className="h-9 text-xs font-mono"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Works with any Git host (GitHub, GitLab, Bitbucket, Codeberg, or custom Git
                  server). Clones all files and whole directory tree into GitBowl.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="import-target-name" className="text-xs">
                  Target GitBowl repository name
                </Label>
                <Input
                  id="import-target-name"
                  value={importTargetName}
                  onChange={(e) =>
                    setImportTargetName(e.target.value.replace(/[^a-zA-Z0-9._-]/g, "-"))
                  }
                  placeholder="my-imported-repo"
                  className="h-9 text-xs font-mono"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3">
                <div>
                  <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    {importPrivate ? (
                      <Lock className="h-3.5 w-3.5" />
                    ) : (
                      <Globe className="h-3.5 w-3.5" />
                    )}
                    {importPrivate ? "Import as Private" : "Import as Public"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Choose visibility for the newly cloned GitBowl repository.
                  </div>
                </div>
                <Switch checked={importPrivate} onCheckedChange={setImportPrivate} />
              </div>

              {/* Unicode & Character Encoding Safety Guarantee Badge */}
              <div className="flex items-start gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-semibold text-foreground">
                    Zero Unicode Escape Errors:{" "}
                  </span>
                  GitBowl automatically normalizes text streams, strips illegal null bytes (
                  <code className="text-primary font-mono text-[10px]">\u0000</code>), and safely
                  encodes binary files to Base64 to guarantee 100% database compatibility without
                  22P05 failures.
                </div>
              </div>

              {/* LIVE MULTI-STAGE PROGRESS MONITOR */}
              {importBusy && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4.5 space-y-4 shadow-sm animate-in fade-in-50 duration-300">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span className="text-xs font-semibold text-foreground">
                        {importStatus || "Cloning repository..."}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
                      <span>{elapsedSeconds}s</span>
                      <span className="text-primary font-semibold">{importProgress}%</span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-muted/60 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-primary h-full rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${importProgress}%` }}
                    />
                  </div>

                  {/* Step Checkpoints */}
                  <div className="space-y-2 pt-1 border-t border-border/40">
                    {CLONE_STAGES.map((stage, idx) => {
                      const isDone = importStep > idx;
                      const isCurrent = importStep === idx;
                      return (
                        <div
                          key={stage.title}
                          className={`flex items-start gap-2.5 text-xs transition-colors ${
                            isCurrent
                              ? "text-foreground font-medium"
                              : isDone
                                ? "text-muted-foreground"
                                : "text-muted-foreground/40"
                          }`}
                        >
                          <div className="mt-0.5 shrink-0">
                            {isDone ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                            ) : isCurrent ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                            ) : (
                              <div className="h-3.5 w-3.5 rounded-full border border-border/80 flex items-center justify-center text-[9px] font-mono text-muted-foreground">
                                {idx + 1}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span>{stage.title}</span>
                              {isCurrent && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-primary/10 text-primary font-normal animate-pulse">
                                  running
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground font-normal leading-tight mt-0.5">
                              {stage.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* DIAGNOSTIC ERROR DISPLAY */}
              {importError && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <div className="flex-1 text-xs">
                      <h4 className="font-semibold text-destructive">
                        Import Issue Resolved & Recovered
                      </h4>
                      <p className="text-muted-foreground mt-0.5">{importError}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleImport()}
                      className="h-7 text-xs gap-1.5 border-destructive/30 hover:bg-destructive/10 text-foreground"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>Retry Import</span>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setImportError(null)}
                      className="h-7 text-xs text-muted-foreground"
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              )}

              <Button
                type="submit"
                disabled={importBusy || !githubUrl.trim()}
                className="h-9 text-xs font-semibold gap-2 w-full sm:w-auto"
              >
                {importBusy ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Importing ({importProgress}%)...</span>
                  </>
                ) : (
                  <>
                    <DownloadCloud className="h-3.5 w-3.5" />
                    <span>Clone & Import Repository</span>
                  </>
                )}
              </Button>
            </form>

            {/* CONNECTED GITHUB REPOSITORIES PICKER */}
            <div className="panel rounded-xl border border-border bg-card p-6 space-y-4 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-primary" /> Your GitHub Repositories
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Click any repository to verify and import with one click.
                  </p>
                </div>

                {!githubToken && (
                  <Button asChild variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                    <Link to="/auth" search={{ redirect: "/new?tab=import" }}>
                      Sign in with GitHub to link repos
                    </Link>
                  </Button>
                )}
              </div>

              {githubToken && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Filter your GitHub repositories..."
                      value={repoFilter}
                      onChange={(e) => setRepoFilter(e.target.value)}
                      className="h-8 pl-8 text-xs"
                    />
                  </div>

                  {loadingUserRepos ? (
                    <div className="py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>Loading your GitHub repositories...</span>
                    </div>
                  ) : filteredUserRepos.length > 0 ? (
                    <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1 divide-y divide-border/40">
                      {filteredUserRepos.map((repo) => (
                        <div
                          key={repo.id}
                          className="flex items-center justify-between py-2 text-xs hover:bg-muted/40 px-2 rounded-md transition-colors"
                        >
                          <div className="min-w-0 flex-1 pr-3">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground font-mono truncate">
                                {repo.full_name}
                              </span>
                              {repo.private && (
                                <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] text-muted-foreground flex items-center gap-1">
                                  <Lock className="h-2.5 w-2.5" /> Private
                                </span>
                              )}
                            </div>
                            {repo.description && (
                              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                {repo.description}
                              </p>
                            )}
                          </div>

                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setGithubUrl(repo.full_name);
                              setImportTargetName(repo.name);
                              handleImport(undefined, repo.full_name);
                            }}
                            disabled={importBusy}
                            className="h-7 text-xs shrink-0 gap-1"
                          >
                            <DownloadCloud className="h-3 w-3" />
                            <span>Import</span>
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-6 text-center text-xs text-muted-foreground">
                      No matching GitHub repositories found.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
