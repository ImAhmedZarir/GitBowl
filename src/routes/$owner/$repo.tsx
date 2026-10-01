import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  CircleDot,
  CircleCheck,
  Code2,
  Copy,
  Download,
  File as FileIcon,
  FilePlus,
  Folder,
  FolderOpen,
  GitCommit,
  GitFork,
  History,
  Lock,
  MoreHorizontal,
  Pencil,
  Settings,
  Share2,
  Star,
  Trash2,
  Upload,
  Undo2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
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
import { useAuth } from "@/lib/auth";
import {
  buildTree,
  copyRepository,
  downloadRepoZip,
  filesFromZip,
  readUploadedFile,
  type RepoFile,
  type TreeNode,
} from "@/lib/repo";

const CodeEditor = lazy(() => import("@/components/CodeEditor"));

type Tab = "code" | "issues" | "commits" | "settings";

export const Route = createFileRoute("/$owner/$repo")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab | undefined } => ({
    tab: ["code", "issues", "commits", "settings"].includes(s["tab"] as string)
      ? (s["tab"] as Tab)
      : undefined,
  }),
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RepoPage,
});

type Working = Record<string, { content: string; is_binary: boolean }>;

function timeAgo(d: string) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} minutes ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hours ago`;
  return `${Math.floor(s / 86400)} days ago`;
}

function RepoPage() {
  const { owner, repo: repoName } = Route.useParams();
  const { tab = "code" } = Route.useSearch();
  const { user, profile } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["repo", owner, repoName],
    queryFn: async () => {
      const { data: p } = await supabase
        .from("profiles")
        .select("id, username")
        .eq("username", owner)
        .maybeSingle();
      if (!p) return null;
      const { data: repo } = await supabase
        .from("repositories")
        .select("*")
        .eq("owner_id", p.id)
        .eq("name", repoName)
        .maybeSingle();
      if (!repo) return null;
      const [{ data: files }, { data: parent }] = await Promise.all([
        supabase.from("repo_files").select("*").eq("repo_id", repo.id),
        repo.forked_from
          ? supabase
              .from("repositories")
              .select("name, profiles(username)")
              .eq("id", repo.forked_from)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      return { owner: p, repo, files: (files ?? []) as RepoFile[], parent: parent as any };
    },
  });

  const { data: starred } = useQuery({
    queryKey: ["starred", data?.repo.id, user?.id],
    enabled: !!data && !!user,
    queryFn: async () => {
      const { data: s } = await supabase
        .from("stars")
        .select("repo_id")
        .eq("repo_id", data!.repo.id)
        .eq("user_id", user!.id)
        .maybeSingle();
      return !!s;
    },
  });

  if (isLoading)
    return (
      <Shell>
        <p className="p-10 text-sm text-muted-foreground">Loading repository…</p>
      </Shell>
    );
  if (!data) {
    return (
      <Shell>
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <h1 className="text-xl font-semibold">Repository not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {owner}/{repoName} doesn't exist or is private.
          </p>
        </div>
      </Shell>
    );
  }

  const { repo, files } = data;
  const isOwner = user?.id === repo.owner_id;
  const refresh = () => qc.invalidateQueries({ queryKey: ["repo", owner, repoName] });

  const toggleStar = async () => {
    if (!user) return void toast.error("Sign in to star repositories");
    if (starred)
      await supabase.from("stars").delete().eq("repo_id", repo.id).eq("user_id", user.id);
    else await supabase.from("stars").insert({ repo_id: repo.id, user_id: user.id });
    qc.invalidateQueries({ queryKey: ["starred", repo.id, user.id] });
    refresh();
  };

  return (
    <Shell>
      <div className="border-b border-border bg-secondary/40">
        <div className="mx-auto max-w-[1400px] px-4 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-lg">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                <Link to="/$owner" params={{ owner }} className="text-primary hover:underline">
                  {owner}
                </Link>
                <span className="text-muted-foreground">/</span>
                <span className="font-semibold text-primary">{repo.name}</span>
                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                  {repo.is_private ? (
                    <span className="inline-flex items-center gap-1">
                      <Lock className="h-3 w-3" />
                      Private
                    </span>
                  ) : (
                    "Public"
                  )}
                </span>
              </div>
              {data.parent ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  forked from{" "}
                  <Link
                    to="/$owner/$repo"
                    params={{ owner: data.parent.profiles?.username ?? "", repo: data.parent.name }}
                    className="text-primary hover:underline"
                  >
                    {data.parent.profiles?.username}/{data.parent.name}
                  </Link>
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <ShareButton />
              <ForkButton repo={repo} isOwner={isOwner} />
              <Button variant="outline" size="sm" onClick={toggleStar}>
                <Star className={`mr-1.5 h-4 w-4 ${starred ? "fill-current text-warning" : ""}`} />
                {starred ? "Starred" : "Star"}
                <span className="ml-2 rounded-full bg-muted px-1.5 text-xs">
                  {repo.stars_count}
                </span>
              </Button>
            </div>
          </div>
          <nav className="mt-4 flex gap-1 overflow-x-auto">
            {(
              [
                ["code", "Code", Code2],
                ["issues", "Issues", CircleDot],
                ["commits", "Commits", History],
                ...(isOwner ? [["settings", "Settings", Settings]] : []),
              ] as [Tab, string, any][]
            ).map(([key, label, Icon]) => (
              <Link
                key={key}
                to="/$owner/$repo"
                params={{ owner, repo: repoName }}
                search={{ tab: key === "code" ? undefined : key }}
                className={`flex items-center gap-2 border-b-2 px-3 py-2 text-sm ${
                  tab === key
                    ? "border-accent-foreground font-semibold text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 py-5">
        {tab === "code" && (
          <CodeTab
            key={repo.id + files.length + repo.updated_at}
            repo={repo}
            files={files}
            isOwner={isOwner}
            authorId={profile?.id}
            onSaved={refresh}
          />
        )}
        {tab === "commits" && <CommitsTab repoId={repo.id} />}
        {tab === "issues" && <IssuesTab repoId={repo.id} />}
        {tab === "settings" && isOwner && <SettingsTab repo={repo} owner={owner} />}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      {children}
    </div>
  );
}

function ShareButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        const url = window.location.href.split("?")[0] ?? "";
        if (navigator.share) await navigator.share({ url }).catch(() => {});
        else {
          await navigator.clipboard.writeText(url);
          toast.success("Link copied");
        }
      }}
    >
      <Share2 className="mr-1.5 h-4 w-4" /> Share
    </Button>
  );
}

function ForkButton({ repo, isOwner }: { repo: any; isOwner: boolean }) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"fork" | "clone">("fork");
  const [name, setName] = useState(repo.name);
  const [busy, setBusy] = useState(false);

  const start = (m: "fork" | "clone") => {
    if (!user) return void toast.error("Sign in first");
    setMode(m);
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
        isFork: mode === "fork",
      });
      toast.success(mode === "fork" ? "Fork created" : "Repository cloned to your account");
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <GitFork className="mr-1.5 h-4 w-4" /> Fork
            <span className="ml-2 rounded-full bg-muted px-1.5 text-xs">{repo.forks_count}</span>
            <ChevronDown className="ml-1 h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => start("fork")}>
            <GitFork className="mr-2 h-4 w-4" />
            Create a fork
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => start("clone")}>
            <Copy className="mr-2 h-4 w-4" />
            Clone to my account
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {mode === "fork" ? "Create a new fork" : "Clone into your account"}
            </DialogTitle>
          </DialogHeader>
          <Label>Repository name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value.replace(/[^\w.-]/g, "-"))} />
          <DialogFooter>
            <Button onClick={submit} disabled={busy || !name}>
              {busy ? "Working…" : mode === "fork" ? "Create fork" : "Clone"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------------- Code tab ---------------- */

function CodeTab({
  repo,
  files,
  isOwner,
  authorId,
  onSaved,
}: {
  repo: any;
  files: RepoFile[];
  isOwner: boolean;
  authorId?: string | undefined;
  onSaved: () => void;
}) {
  const original = useMemo<Working>(
    () =>
      Object.fromEntries(
        files.map((f) => [f.path, { content: f.content, is_binary: f.is_binary }]),
      ),
    [files],
  );
  const [working, setWorking] = useState<Working>(original);
  const [active, setActive] = useState<string | null>(null);
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<null | {
    kind: "new" | "move" | "copy";
    path: string;
    isFolder?: boolean;
  }>(null);
  const [commitOpen, setCommitOpen] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  const changes = useMemo(() => {
    const out: { path: string; type: "added" | "modified" | "deleted" }[] = [];
    for (const p of Object.keys(working)) {
      if (!original[p]) out.push({ path: p, type: "added" });
      else if (original[p].content !== working[p]!.content) out.push({ path: p, type: "modified" });
    }
    for (const p of Object.keys(original)) if (!working[p]) out.push({ path: p, type: "deleted" });
    return out;
  }, [working, original]);

  const tree = useMemo(
    () =>
      buildTree(
        Object.entries(working).map(([path, v]) => ({
          id: path,
          repo_id: repo.id,
          path,
          content: v.content,
          is_binary: v.is_binary,
          size: v.content.length,
          updated_at: "",
        })),
      ),
    [working, repo.id],
  );

  // Warn before losing uncommitted work
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (changes.length) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [changes.length]);

  // Ctrl/Cmd+S opens commit dialog
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (isOwner && changes.length) setCommitOpen(true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isOwner, changes.length]);

  const underPrefix = (p: string, prefix: string) => p === prefix || p.startsWith(prefix + "/");

  const transfer = (from: string, to: string, isFolder: boolean, keep: boolean) => {
    to = to.replace(/^\/+|\/+$/g, "");
    if (!to || to === from) return;
    setWorking((w) => {
      const next = { ...w };
      for (const p of Object.keys(w)) {
        if (isFolder ? underPrefix(p, from) : p === from) {
          const target = isFolder ? to + p.slice(from.length) : to;
          next[target] = w[p]!;
          if (!keep) delete next[p];
        }
      }
      return next;
    });
    if (!keep && active && (isFolder ? underPrefix(active, from) : active === from))
      setActive(isFolder ? to + active.slice(from.length) : to);
    toast.success(`${keep ? "Copied" : "Moved"} to ${to} (uncommitted)`);
  };

  const remove = (path: string, isFolder: boolean) => {
    setWorking((w) =>
      Object.fromEntries(
        Object.entries(w).filter(([p]) => !(isFolder ? underPrefix(p, path) : p === path)),
      ),
    );
    if (active && (isFolder ? underPrefix(active, path) : active === path)) setActive(null);
  };

  const onUpload = async (list: FileList | null) => {
    if (!list) return;
    const base = dialog?.path ?? "";
    const next: Working = {};
    for (const f of Array.from(list)) {
      if (f.name.toLowerCase().endsWith(".zip")) {
        for (const e of await filesFromZip(f))
          next[e.path] = { content: e.content, is_binary: e.isBinary };
      } else {
        const r = await readUploadedFile(f);
        next[(f as any).webkitRelativePath || f.name] = {
          content: r.content,
          is_binary: r.isBinary,
        };
      }
    }
    setWorking((w) => ({ ...w, ...next }));
    toast.success(`${Object.keys(next).length} file(s) staged${base ? "" : ""}`);
  };

  const commit = async (message: string) => {
    const upserts = changes
      .filter((c) => c.type !== "deleted")
      .map((c) => ({
        repo_id: repo.id,
        path: c.path,
        content: working[c.path]!.content,
        is_binary: working[c.path]!.is_binary,
        size: working[c.path]!.content.length,
        updated_at: new Date().toISOString(),
      }));
    const deletes = changes.filter((c) => c.type === "deleted").map((c) => c.path);
    if (upserts.length) {
      const { error } = await supabase
        .from("repo_files")
        .upsert(upserts, { onConflict: "repo_id,path" });
      if (error) return void toast.error(error.message);
    }
    if (deletes.length) {
      const { error } = await supabase
        .from("repo_files")
        .delete()
        .eq("repo_id", repo.id)
        .in("path", deletes);
      if (error) return void toast.error(error.message);
    }
    await supabase
      .from("commits")
      .insert({ repo_id: repo.id, author_id: authorId ?? null, message, changes });
    await supabase
      .from("repositories")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", repo.id);
    toast.success(`Committed ${changes.length} change(s)`);
    setCommitOpen(false);
    onSaved();
  };

  const readme = Object.keys(working).find((p) => /^readme(\.md|\.txt)?$/i.test(p));
  const changeFor = (p: string) => changes.find((c) => c.path === p)?.type;

  const renderNode = (n: TreeNode, depth: number): React.ReactNode => {
    const isOpen = openFolders.has(n.path);
    const ch = n.type === "file" ? changeFor(n.path) : undefined;
    return (
      <div key={n.type + n.path}>
        <div
          className={`group flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-sm hover:bg-muted ${active === n.path ? "bg-accent text-accent-foreground" : ""}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => {
            if (n.type === "folder")
              setOpenFolders((s) => {
                const x = new Set(s);
                x.has(n.path) ? x.delete(n.path) : x.add(n.path);
                return x;
              });
            else setActive(n.path);
          }}
        >
          {n.type === "folder" ? (
            <>
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              )}
              {isOpen ? (
                <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
              ) : (
                <Folder className="h-4 w-4 shrink-0 text-primary" />
              )}
            </>
          ) : (
            <FileIcon className="ml-[18px] h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span
            className={`truncate ${ch === "added" ? "text-success" : ch === "modified" ? "text-warning" : ""}`}
          >
            {n.name}
          </span>
          {ch ? (
            <span className="ml-auto text-[10px] font-semibold uppercase text-muted-foreground">
              {ch[0]}
            </span>
          ) : null}
          {isOwner && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <button
                  className={`${ch ? "" : "ml-auto"} rounded p-0.5 opacity-0 hover:bg-background group-hover:opacity-100`}
                  aria-label="File actions"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
                {n.type === "folder" && (
                  <DropdownMenuItem onClick={() => setDialog({ kind: "new", path: n.path + "/" })}>
                    <FilePlus className="mr-2 h-4 w-4" />
                    New file here
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() =>
                    setDialog({ kind: "move", path: n.path, isFolder: n.type === "folder" })
                  }
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Rename / Move
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    setDialog({ kind: "copy", path: n.path, isFolder: n.type === "folder" })
                  }
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy to…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => remove(n.path, n.type === "folder")}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {n.type === "folder" && isOpen && n.children?.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  const activeFile = active ? working[active] : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm font-medium">
          <GitCommit className="h-4 w-4" /> {repo.default_branch}
        </span>
        <span className="text-sm text-muted-foreground">{Object.keys(working).length} files</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {isOwner && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDialog({ kind: "new", path: "" })}
              >
                <FilePlus className="mr-1.5 h-4 w-4" />
                Add file
              </Button>
              <Button size="sm" variant="outline" onClick={() => uploadRef.current?.click()}>
                <Upload className="mr-1.5 h-4 w-4" />
                Upload / ZIP
              </Button>
              <input
                ref={uploadRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  onUpload(e.target.files);
                  e.target.value = "";
                }}
              />
            </>
          )}
          <CloneMenu repo={repo} files={files} />
        </div>
      </div>

      {isOwner && changes.length > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-warning/40 bg-warning/10 px-4 py-2 text-sm">
          <span>
            <b>{changes.length}</b> uncommitted change(s)
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setWorking(original);
              setActive(null);
            }}
          >
            <Undo2 className="mr-1.5 h-4 w-4" />
            Discard
          </Button>
          <Button size="sm" className="ml-auto" onClick={() => setCommitOpen(true)}>
            <GitCommit className="mr-1.5 h-4 w-4" />
            Commit changes <kbd className="ml-2 hidden text-[10px] opacity-70 sm:inline">⌘S</kbd>
          </Button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <aside className="panel max-h-[70vh] overflow-auto p-2">
          {tree.length ? (
            tree.map((n) => renderNode(n, 0))
          ) : (
            <p className="p-3 text-sm text-muted-foreground">Empty repository.</p>
          )}
        </aside>
        <section className="panel min-h-[60vh] overflow-hidden">
          {active && activeFile ? (
            <div className="flex h-[70vh] flex-col">
              <div className="flex items-center justify-between border-b border-border bg-secondary px-4 py-2 text-sm">
                <span className="font-mono">{active}</span>
                <span className="text-xs text-muted-foreground">
                  {isOwner ? "Editing — changes are staged until you commit" : "Read only"}
                </span>
              </div>
              {activeFile.is_binary ? (
                <BinaryPreview path={active} content={activeFile.content} />
              ) : (
                <div className="flex-1">
                  <ClientOnly
                    fallback={<pre className="p-4 font-mono text-sm">{activeFile.content}</pre>}
                  >
                    <Suspense
                      fallback={
                        <p className="p-4 text-sm text-muted-foreground">Loading editor…</p>
                      }
                    >
                      <CodeEditor
                        path={active}
                        value={activeFile.content}
                        readOnly={!isOwner}
                        onChange={(v) =>
                          setWorking((w) => ({ ...w, [active]: { content: v, is_binary: false } }))
                        }
                      />
                    </Suspense>
                  </ClientOnly>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 border-b border-border bg-secondary px-4 py-2 text-sm font-semibold">
                <BookOpen className="h-4 w-4" /> {readme ?? "README"}
              </div>
              <div className="p-6">
                {repo.description && (
                  <p className="mb-4 text-muted-foreground">{repo.description}</p>
                )}
                {readme ? (
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                    {working[readme]!.content}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Pick a file on the left to view it
                    {isOwner ? ", or add a README.md to describe your project." : "."}
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      <PathDialog
        state={dialog}
        onClose={() => setDialog(null)}
        onSubmit={(value) => {
          if (!dialog) return;
          if (dialog.kind === "new") {
            const p = value.replace(/^\/+/, "");
            if (working[p]) return void toast.error("File already exists");
            setWorking((w) => ({ ...w, [p]: { content: "", is_binary: false } }));
            setActive(p);
          } else transfer(dialog.path, value, !!dialog.isFolder, dialog.kind === "copy");
          setDialog(null);
        }}
      />
      <CommitDialog
        open={commitOpen}
        onOpenChange={setCommitOpen}
        changes={changes}
        onCommit={commit}
      />
    </div>
  );
}

function BinaryPreview({ path, content }: { path: string; content: string }) {
  const ext = path.split(".").pop()?.toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "ico"].includes(ext ?? "")) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <img
          src={`data:image/${ext === "jpg" ? "jpeg" : ext};base64,${content}`}
          alt={path}
          className="max-h-full max-w-full"
        />
      </div>
    );
  }
  return (
    <p className="p-6 text-sm text-muted-foreground">Binary file — download the ZIP to view it.</p>
  );
}

function CloneMenu({ repo, files }: { repo: any; files: RepoFile[] }) {
  const url =
    typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}.git` : "";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm">
          <Code2 className="mr-1.5 h-4 w-4" />
          Code
          <ChevronDown className="ml-1 h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-3">
        <p className="mb-2 text-sm font-semibold">Clone with HTTPS</p>
        <div className="flex gap-1">
          <Input readOnly value={url} className="h-8 font-mono text-xs" />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(url);
              toast.success("Copied");
            }}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">git clone {url}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Push with your GitBowl username and password.
          {repo.is_private ? " Private repo: sign in required to clone." : ""}
        </p>
        <DropdownMenuSeparator className="my-3" />
        <DropdownMenuItem onClick={() => downloadRepoZip(repo.name, files)}>
          <Download className="mr-2 h-4 w-4" />
          Download ZIP
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PathDialog({
  state,
  onClose,
  onSubmit,
}: {
  state: null | { kind: "new" | "move" | "copy"; path: string; isFolder?: boolean };
  onClose: () => void;
  onSubmit: (v: string) => void;
}) {
  const [value, setValue] = useState("");
  useEffect(() => {
    if (state) setValue(state.kind === "copy" ? state.path + "-copy" : state.path);
  }, [state]);
  const title =
    state?.kind === "new"
      ? "New file"
      : state?.kind === "move"
        ? `Move / rename ${state.isFolder ? "folder" : "file"}`
        : `Copy ${state?.isFolder ? "folder" : "file"}`;
  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Label>Path (use / to create folders, e.g. src/utils/helpers.ts)</Label>
        <Input
          autoFocus
          className="font-mono"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && value && onSubmit(value)}
        />
        <DialogFooter>
          <Button onClick={() => onSubmit(value)} disabled={!value || value.endsWith("/")}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CommitDialog({
  open,
  onOpenChange,
  changes,
  onCommit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  changes: { path: string; type: string }[];
  onCommit: (m: string) => Promise<unknown>;
}) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Commit changes</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="Describe what you changed"
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
        />
        <ul className="max-h-48 space-y-1 overflow-auto rounded-md border border-border p-2 font-mono text-xs">
          {changes.map((c) => (
            <li key={c.path} className="flex gap-2">
              <span
                className={
                  c.type === "added"
                    ? "text-success"
                    : c.type === "deleted"
                      ? "text-destructive"
                      : "text-warning"
                }
              >
                {c.type[0]!.toUpperCase()}
              </span>
              {c.path}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button
            disabled={!msg.trim() || busy}
            onClick={async () => {
              setBusy(true);
              await onCommit(msg.trim());
              setBusy(false);
              setMsg("");
            }}
          >
            {busy ? "Committing…" : "Commit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Commits ---------------- */

function CommitsTab({ repoId }: { repoId: string }) {
  const { data } = useQuery({
    queryKey: ["commits", repoId],
    queryFn: async () =>
      (
        await supabase
          .from("commits")
          .select("*, profiles(username)")
          .eq("repo_id", repoId)
          .order("created_at", { ascending: false })
      ).data ?? [],
  });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="panel divide-y divide-border">
      {(data ?? []).map((c: any) => (
        <div key={c.id} className="px-4 py-3">
          <button className="w-full text-left" onClick={() => setOpen(open === c.id ? null : c.id)}>
            <p className="font-medium">{c.message}</p>
            <p className="text-xs text-muted-foreground">
              <b>{c.profiles?.username ?? "unknown"}</b> committed {timeAgo(c.created_at)} ·{" "}
              {(c.changes ?? []).length} file(s) ·{" "}
              <span className="font-mono">{c.id.slice(0, 7)}</span>
            </p>
          </button>
          {open === c.id && (
            <ul className="mt-2 space-y-0.5 font-mono text-xs">
              {(c.changes ?? []).map((x: any) => (
                <li key={x.path}>
                  <span className="text-muted-foreground">{x.type}</span> {x.path}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {data?.length === 0 && <p className="p-6 text-sm text-muted-foreground">No commits yet.</p>}
    </div>
  );
}

/* ---------------- Issues ---------------- */

function IssuesTab({ repoId }: { repoId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"open" | "closed">("open");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const { data } = useQuery({
    queryKey: ["issues", repoId],
    queryFn: async () =>
      (
        await supabase
          .from("issues")
          .select("*, profiles(username)")
          .eq("repo_id", repoId)
          .order("number", { ascending: false })
      ).data ?? [],
  });

  if (selected) return <IssueDetail id={selected} onBack={() => setSelected(null)} />;

  const list = (data ?? []).filter((i: any) => i.state === filter);
  const create = async () => {
    const { error } = await supabase
      .from("issues")
      .insert({ repo_id: repoId, author_id: user!.id, title, body, number: 0 });
    if (error) return void toast.error(error.message);
    setTitle("");
    setBody("");
    setCreating(false);
    qc.invalidateQueries({ queryKey: ["issues", repoId] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={filter === "open" ? "secondary" : "ghost"}
          onClick={() => setFilter("open")}
        >
          <CircleDot className="mr-1.5 h-4 w-4" />
          {(data ?? []).filter((i: any) => i.state === "open").length} Open
        </Button>
        <Button
          size="sm"
          variant={filter === "closed" ? "secondary" : "ghost"}
          onClick={() => setFilter("closed")}
        >
          <CircleCheck className="mr-1.5 h-4 w-4" />
          {(data ?? []).filter((i: any) => i.state === "closed").length} Closed
        </Button>
        {user && (
          <Button size="sm" className="ml-auto" onClick={() => setCreating(true)}>
            New issue
          </Button>
        )}
      </div>
      {creating && (
        <div className="panel space-y-2 p-4">
          <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea
            placeholder="Leave a description"
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={!title.trim()} onClick={create}>
              Submit issue
            </Button>
          </div>
        </div>
      )}
      <div className="panel divide-y divide-border">
        {list.map((i: any) => (
          <button
            key={i.id}
            onClick={() => setSelected(i.id)}
            className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50"
          >
            {i.state === "open" ? (
              <CircleDot className="mt-0.5 h-4 w-4 text-success" />
            ) : (
              <CircleCheck className="mt-0.5 h-4 w-4 text-primary" />
            )}
            <div>
              <p className="font-semibold">{i.title}</p>
              <p className="text-xs text-muted-foreground">
                #{i.number} opened {timeAgo(i.created_at)} by {i.profiles?.username}
              </p>
            </div>
          </button>
        ))}
        {list.length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">No {filter} issues.</p>
        )}
      </div>
    </div>
  );
}

function IssueDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const { data } = useQuery({
    queryKey: ["issue", id],
    queryFn: async () => {
      const { data: issue } = await supabase
        .from("issues")
        .select("*, profiles(username)")
        .eq("id", id)
        .single();
      const { data: comments } = await supabase
        .from("issue_comments")
        .select("*, profiles(username)")
        .eq("issue_id", id)
        .order("created_at");
      return { issue: issue as any, comments: (comments ?? []) as any[] };
    },
  });
  if (!data) return null;
  const { issue, comments } = data;
  const reload = () => {
    qc.invalidateQueries({ queryKey: ["issue", id] });
    qc.invalidateQueries({ queryKey: ["issues", issue.repo_id] });
  };

  return (
    <div className="max-w-3xl space-y-4">
      <button onClick={onBack} className="text-sm text-primary hover:underline">
        ← All issues
      </button>
      <h2 className="text-2xl">
        {issue.title} <span className="text-muted-foreground">#{issue.number}</span>
      </h2>
      <span
        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm text-primary-foreground ${issue.state === "open" ? "bg-success" : "bg-primary"}`}
      >
        {issue.state === "open" ? (
          <CircleDot className="h-4 w-4" />
        ) : (
          <CircleCheck className="h-4 w-4" />
        )}{" "}
        {issue.state}
      </span>
      {[
        {
          id: "body",
          body: issue.body || "No description provided.",
          profiles: issue.profiles,
          created_at: issue.created_at,
        },
        ...comments,
      ].map((c) => (
        <div key={c.id} className="panel">
          <div className="border-b border-border bg-secondary px-4 py-2 text-sm">
            <b>{c.profiles?.username}</b>{" "}
            <span className="text-muted-foreground">commented {timeAgo(c.created_at)}</span>
          </div>
          <p className="whitespace-pre-wrap p-4 text-sm">{c.body}</p>
        </div>
      ))}
      {user && (
        <div className="panel space-y-2 p-4">
          <Textarea
            rows={4}
            placeholder="Add a comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await supabase
                  .from("issues")
                  .update({ state: issue.state === "open" ? "closed" : "open" })
                  .eq("id", id);
                reload();
              }}
            >
              {issue.state === "open" ? "Close issue" : "Reopen issue"}
            </Button>
            <Button
              size="sm"
              disabled={!comment.trim()}
              onClick={async () => {
                const { error } = await supabase
                  .from("issue_comments")
                  .insert({ issue_id: id, author_id: user.id, body: comment });
                if (error) return void toast.error(error.message);
                setComment("");
                reload();
              }}
            >
              Comment
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Settings ---------------- */

function SettingsTab({ repo, owner }: { repo: any; owner: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState(repo.name);
  const [description, setDescription] = useState(repo.description ?? "");
  const [isPrivate, setIsPrivate] = useState(repo.is_private);
  const [confirm, setConfirm] = useState("");

  const save = async () => {
    const { error } = await supabase
      .from("repositories")
      .update({ name, description, is_private: isPrivate })
      .eq("id", repo.id);
    if (error) return void toast.error(error.message);
    toast.success("Settings saved");
    qc.invalidateQueries({ queryKey: ["repo"] });
    navigate({ to: "/$owner/$repo", params: { owner, repo: name }, search: { tab: "settings" } });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="panel space-y-4 p-5">
        <h2 className="text-lg font-semibold">General</h2>
        <div className="space-y-1">
          <Label>Repository name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value.replace(/[^\w.-]/g, "-"))} />
        </div>
        <div className="space-y-1">
          <Label>Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
          <Label>Private repository</Label>
        </div>
        <Button onClick={save}>Save changes</Button>
      </div>
      <div className="panel space-y-3 border-destructive/50 p-5">
        <h2 className="text-lg font-semibold text-destructive">Danger zone</h2>
        <p className="text-sm text-muted-foreground">
          Type <b>{repo.name}</b> to permanently delete this repository.
        </p>
        <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <Button
          variant="destructive"
          disabled={confirm !== repo.name}
          onClick={async () => {
            const { error } = await supabase.from("repositories").delete().eq("id", repo.id);
            if (error) return void toast.error(error.message);
            toast.success("Repository deleted");
            navigate({ to: "/$owner", params: { owner } });
          }}
        >
          Delete this repository
        </Button>
      </div>
    </div>
  );
}
