import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Tag,
  Plus,
  Download,
  Calendar,
  Sparkles,
  Trash2,
  Package,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { toast } from "sonner";

interface ReleasesTabProps {
  repoId: string;
  isOwner: boolean;
  repoName: string;
  owner: string;
}

export function ReleasesTab({ repoId, isOwner, repoName, owner }: ReleasesTabProps) {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [tagName, setTagName] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isPrerelease, setIsPrerelease] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [generatingNotes, setGeneratingNotes] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: releases = [], isLoading } = useQuery({
    queryKey: ["repo-releases", repoId],
    queryFn: async () => {
      const res = await fetch(`/api/repo/releases?repoId=${repoId}`);
      if (!res.ok) {
        throw new Error("Failed to load releases");
      }
      const json = await res.json();
      return json.releases || [];
    },
    staleTime: 1000 * 30,
  });

  async function handleGenerateNotes() {
    setGeneratingNotes(true);
    try {
      const { data: commits } = await supabase
        .from("commits")
        .select("message")
        .eq("repo_id", repoId)
        .order("created_at", { ascending: false })
        .limit(15);

      if (commits && commits.length > 0) {
        const notes =
          `## What's Changed\n\n` +
          commits.map((c) => `* ${c.message.split("\n")[0]}`).join("\n");
        setBody(notes);
        if (!title && tagName) {
          setTitle(`Release ${tagName}`);
        }
        toast.success("Release notes generated from recent commits");
      } else {
        setBody("## What's Changed\n\n* Initial release");
      }
    } catch {
      toast.error("Could not fetch commits to generate notes");
    } finally {
      setGeneratingNotes(false);
    }
  }

  async function handleCreateRelease(e: React.FormEvent) {
    e.preventDefault();
    if (!tagName.trim() || !title.trim()) {
      return toast.error("Tag version and Release title are required");
    }

    setSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Authentication required");

      const res = await fetch("/api/repo/releases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          repoId,
          tagName: tagName.trim(),
          title: title.trim(),
          body: body.trim(),
          isPrerelease,
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || "Failed to create release");
      }

      toast.success(`Published release ${tagName}`);
      setCreateOpen(false);
      setTagName("");
      setTitle("");
      setBody("");
      setIsPrerelease(false);
      qc.invalidateQueries({ queryKey: ["repo-releases", repoId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to publish release");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteRelease(id: string, tag: string) {
    if (!confirm(`Are you sure you want to delete release ${tag}?`)) return;

    setDeletingId(id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Authentication required");

      const res = await fetch(`/api/repo/releases?id=${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || "Failed to delete release");
      }

      toast.success(`Deleted release ${tag}`);
      qc.invalidateQueries({ queryKey: ["repo-releases", repoId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete release");
    } finally {
      setDeletingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4 py-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-40 rounded-xl bg-card border border-border animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-2">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Tag className="h-5 w-5 text-muted-foreground" />
            <span>Releases &amp; Tags</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Package and distribute tagged builds and milestones of this repository.
          </p>
        </div>

        {isOwner && (
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            className="h-8 gap-1.5 text-xs bg-foreground text-background hover:bg-foreground/90 font-semibold"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Draft a new release</span>
          </Button>
        )}
      </div>

      {/* Releases List */}
      {releases.length > 0 ? (
        <div className="space-y-6">
          {releases.map((rel: any, index: number) => (
            <div
              key={rel.id}
              className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-xs"
            >
              {/* Release Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/80 pb-3">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="text-base font-semibold text-foreground">{rel.title}</h3>
                  <Badge variant="outline" className="font-mono text-xs border-border bg-muted/50 text-foreground">
                    {rel.tag_name}
                  </Badge>
                  {index === 0 && !rel.is_prerelease && (
                    <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[11px]">
                      Latest
                    </Badge>
                  )}
                  {rel.is_prerelease && (
                    <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[11px]">
                      Pre-release
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>
                      released by{" "}
                      <strong className="text-foreground">
                        {rel.profiles?.username || "developer"}
                      </strong>{" "}
                      on {new Date(rel.published_at || rel.created_at).toLocaleDateString()}
                    </span>
                  </span>

                  {isOwner && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteRelease(rel.id, rel.tag_name)}
                      disabled={deletingId === rel.id}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      title="Delete release"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Release Notes */}
              <div className="max-w-none text-xs text-foreground leading-relaxed">
                <MarkdownRenderer content={rel.body || "*No release notes provided.*"} />
              </div>

              {/* Assets Section */}
              <div className="border-t border-border/80 pt-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" />
                  <span>Assets</span>
                </h4>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`/api/public/git/${owner}/${repoName}/archive/${rel.tag_name}.zip`}
                    download
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted/40 text-xs text-foreground hover:bg-muted transition-colors font-mono"
                  >
                    <Download className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Source code (zip)</span>
                  </a>
                  <a
                    href={`/api/public/git/${owner}/${repoName}/archive/${rel.tag_name}.tar.gz`}
                    download
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted/40 text-xs text-foreground hover:bg-muted transition-colors font-mono"
                  >
                    <Download className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Source code (tar.gz)</span>
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-12 text-center space-y-3">
          <div className="h-10 w-10 rounded-full bg-muted text-muted-foreground mx-auto flex items-center justify-center">
            <Tag className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">There aren&apos;t any releases here</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Releases are packaged software deliverables that let users download specific tagged builds of your project.
          </p>
          {isOwner && (
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              className="mt-2 text-xs bg-foreground text-background hover:bg-foreground/90 font-semibold"
            >
              Draft a new release
            </Button>
          )}
        </div>
      )}

      {/* CREATE RELEASE DIALOG */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl bg-card border border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <Tag className="h-4 w-4" />
              <span>Draft a new release</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateRelease} className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-foreground font-medium">Tag version</Label>
                <Input
                  placeholder="e.g. v1.0.0"
                  value={tagName}
                  onChange={(e) => setTagName(e.target.value)}
                  className="h-8 text-xs font-mono bg-background border-border text-foreground"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-foreground font-medium">Release title</Label>
                <Input
                  placeholder="e.g. Initial Production Release"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-8 text-xs bg-background border-border text-foreground"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-foreground font-medium">Describe this release</Label>
                <button
                  type="button"
                  onClick={handleGenerateNotes}
                  disabled={generatingNotes}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="h-3 w-3 text-muted-foreground" />
                  <span>{generatingNotes ? "Generating..." : "Auto-generate from commits"}</span>
                </button>
              </div>
              <Textarea
                placeholder="Markdown release notes, feature highlights, and breaking changes..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="min-h-[140px] text-xs font-mono bg-background border-border text-foreground"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="prerelease"
                checked={isPrerelease}
                onChange={(e) => setIsPrerelease(e.target.checked)}
                className="rounded border-border bg-background text-foreground"
              />
              <Label htmlFor="prerelease" className="text-xs text-muted-foreground font-normal cursor-pointer">
                Set as a pre-release (notify users that this build is experimental)
              </Label>
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreateOpen(false)}
                className="text-xs border-border text-muted-foreground hover:text-foreground"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submitting}
                className="text-xs bg-foreground text-background hover:bg-foreground/90 font-semibold"
              >
                {submitting ? "Publishing..." : "Publish release"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
