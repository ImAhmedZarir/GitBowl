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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { filesFromZip, readUploadedFile } from "@/lib/repo";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

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
          rows.push({
            repo_id: (repo as any).id,
            path: file.name,
            content,
            is_binary: isBinary,
            size: content.length,
          });
        }
      }
      if (rows.length) {
        const { error: fileError } = await supabase.from("repo_files").insert(rows);
        if (fileError) throw fileError;
      }
      await supabase.from("commits").insert({
        repo_id: (repo as any).id,
        author_id: profile.id,
        message: rows.length ? "Initial upload" : "Create repository",
        changes: rows.map((r) => ({ path: r.path, type: "added" })),
      });

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
      return void toast.error("Please enter a GitHub repository URL or select one from below");
    }

    setImportBusy(true);
    setImportStatus("Verifying GitHub repository and tree...");

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
        throw new Error(data.error || "Failed to import GitHub repository");
      }

      toast.success(`Successfully imported ${data.repoName} (${data.fileCount} files)!`);
      navigate({
        to: "/$owner/$repo",
        params: { owner: data.owner || profile.username, repo: data.repoName },
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to import GitHub repository");
    } finally {
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
              {activeTab === "create" ? "Create a new repository" : "Import from GitHub"}
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
              <span>Import from GitHub</span>
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
                  GitHub Repository URL or owner/repo
                </Label>
                <div className="relative">
                  <Input
                    id="gh-url"
                    value={githubUrl}
                    onChange={(e) => {
                      const val = e.target.value;
                      setGithubUrl(val);
                      // Auto-extract repo name
                      const clean = val
                        .trim()
                        .replace(/^https?:\/\/github\.com\//, "")
                        .replace(/\.git$/, "")
                        .replace(/\/$/, "");
                      const parts = clean.split("/");
                      if (parts[1]) setImportTargetName(parts[1]);
                    }}
                    placeholder="e.g. facebook/react or https://github.com/torvalds/subsurface-for-dirk"
                    required
                    className="h-9 text-xs font-mono"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Enter any public GitHub repository URL, or pick from your connected GitHub account
                  below.
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

              <Button
                type="submit"
                disabled={importBusy || !githubUrl.trim()}
                className="h-9 text-xs font-semibold gap-2"
              >
                {importBusy ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>{importStatus || "Importing repository..."}</span>
                  </>
                ) : (
                  <>
                    <DownloadCloud className="h-3.5 w-3.5" />
                    <span>Verify & Import Repository</span>
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
