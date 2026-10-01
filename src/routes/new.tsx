import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { toast } from "sonner";
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
  head: () => ({
    meta: [
      { title: "New repository — GitBowl" },
      {
        name: "description",
        content: "Create a new GitBowl repository and upload your files or a project zip.",
      },
      { property: "og:title", content: "New repository — GitBowl" },
      { property: "og:description", content: "Create a new GitBowl repository in seconds." },
    ],
  }),
  component: NewRepo,
});

function NewRepo() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [uploads, setUploads] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <h1 className="text-xl font-semibold">Sign in to create a repository</h1>
          <Button asChild className="mt-4">
            <Link to="/auth">Sign in</Link>
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
      const { data: repo, error } = await supabase
        .from("repositories")
        .insert({
          owner_id: profile.id,
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
              repo_id: repo.id,
              path: e.path,
              content: e.content,
              is_binary: e.isBinary,
              size: e.content.length,
            }),
          );
        } else {
          const { content, isBinary } = await readUploadedFile(file);
          rows.push({
            repo_id: repo.id,
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
        repo_id: repo.id,
        author_id: profile.id,
        message: rows.length ? "Initial upload" : "Create repository",
        changes: rows.map((r) => ({ path: r.path, type: "added" })),
      });

      toast.success("Repository created");
      navigate({ to: "/$owner/$repo", params: { owner: profile.username, repo: repo.name } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create repository");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-semibold">Create a new repository</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Repositories live at {profile?.username ?? "you"}/name.
        </p>

        <form onSubmit={create} className="panel mt-6 space-y-5 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="name">Repository name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9._-]/g, "-"))}
              placeholder="my-project"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <div className="text-sm font-medium">Private repository</div>
              <div className="text-xs text-muted-foreground">Only you can see it.</div>
            </div>
            <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="files">Upload files or a .zip (optional)</Label>
            <Input
              id="files"
              type="file"
              multiple
              onChange={(e) => setUploads(Array.from(e.target.files ?? []))}
            />
            {uploads.length ? (
              <p className="text-xs text-muted-foreground">{uploads.length} file(s) selected</p>
            ) : null}
          </div>
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create repository"}
          </Button>
        </form>
      </div>
    </div>
  );
}
