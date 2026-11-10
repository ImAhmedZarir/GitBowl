import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Tag,
  Star,
  Eye,
  GitFork,
  Package,
  Globe,
  ExternalLink,
  ShieldAlert,
  Activity,
  Plus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LanguageBar } from "@/components/repo/LanguageBar";
import type { RepoFileMeta } from "@/lib/repo-queries";

interface RepoSidebarProps {
  repo: any;
  filesMeta: RepoFileMeta[];
  isOwner: boolean;
  onSelectTab: (tab: "code" | "issues" | "pulls" | "commits" | "releases" | "insights" | "settings") => void;
}

export function RepoSidebar({ repo, filesMeta, isOwner, onSelectTab }: RepoSidebarProps) {
  // Fetch releases for repo
  const { data: releases = [] } = useQuery({
    queryKey: ["repo-releases", repo.id],
    queryFn: async () => {
      const res = await fetch(`/api/repo/releases?repoId=${repo.id}`);
      if (!res.ok) return [];
      const json = await res.json();
      return json.releases || [];
    },
    staleTime: 30000,
  });

  const latestRelease = releases[0] || null;

  return (
    <div className="space-y-6 text-sm text-foreground">
      {/* 1. ABOUT SECTION */}
      <section className="space-y-3 pb-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">About</h3>
        
        {repo.description ? (
          <p className="text-xs leading-relaxed text-foreground/90 break-words">
            {repo.description}
          </p>
        ) : (
          <p className="text-xs italic text-muted-foreground">
            No description, website, or topics provided.
          </p>
        )}

        {repo.homepage && (
          <div className="flex items-center gap-1.5 text-xs">
            <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <a
              href={repo.homepage.startsWith("http") ? repo.homepage : `https://${repo.homepage}`}
              target="_blank"
              rel="noreferrer noopener"
              className="text-blue-600 dark:text-blue-400 font-medium truncate hover:underline"
            >
              {repo.homepage.replace(/^https?:\/\//, "")}
            </a>
          </div>
        )}

        {/* Resources Badges */}
        <div className="space-y-2 pt-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <BookOpen className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium text-foreground">Readme</span>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 shrink-0" />
            <button
              onClick={() => onSelectTab("insights")}
              className="hover:text-primary transition-colors hover:underline text-left"
            >
              Activity &amp; pulse
            </button>
          </div>
        </div>

        {/* Stars, Watching, Forks Counters */}
        <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-muted-foreground font-medium">
          <div className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-default">
            <Star className="h-3.5 w-3.5 text-amber-500" />
            <span>{repo.stars_count || 0}</span>
            <span className="text-[11px] font-normal">stars</span>
          </div>
          <div className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-default">
            <Eye className="h-3.5 w-3.5" />
            <span>{repo.watchers_count || 0}</span>
            <span className="text-[11px] font-normal">watching</span>
          </div>
          <div className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-default">
            <GitFork className="h-3.5 w-3.5" />
            <span>{repo.forks_count || 0}</span>
            <span className="text-[11px] font-normal">forks</span>
          </div>
        </div>
      </section>

      {/* 2. RELEASES SECTION (GitHub Parity) */}
      <section className="space-y-3 pb-4 border-b border-border">
        <div className="flex items-center justify-between">
          <button
            onClick={() => onSelectTab("releases")}
            className="flex items-center gap-2 font-semibold text-sm hover:text-primary transition-colors text-left group"
          >
            <span>Releases</span>
            {releases.length > 0 && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-mono">
                {releases.length}
              </Badge>
            )}
          </button>
        </div>

        {latestRelease ? (
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Tag className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <button
                onClick={() => onSelectTab("releases")}
                className="font-semibold text-foreground truncate hover:text-primary hover:underline text-left"
              >
                {latestRelease.name || latestRelease.tag_name}
              </button>
              <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.2 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                Latest
              </span>
            </div>
            <p className="text-[11px] font-mono text-muted-foreground">
              {new Date(latestRelease.created_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
            {releases.length > 1 && (
              <button
                onClick={() => onSelectTab("releases")}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline pt-1 block"
              >
                + {releases.length - 1} releases
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <p>No releases published</p>
            {isOwner && (
              <button
                onClick={() => onSelectTab("releases")}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium inline-flex items-center gap-1"
              >
                <Plus className="h-3 w-3" />
                <span>Create a new release</span>
              </button>
            )}
          </div>
        )}
      </section>

      {/* 3. PACKAGES SECTION */}
      <section className="space-y-2 pb-4 border-b border-border text-xs">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Package className="h-3.5 w-3.5 text-muted-foreground" />
          <span>Packages</span>
        </h3>
        <p className="text-muted-foreground">No packages published</p>
      </section>

      {/* 4. LANGUAGES SECTION */}
      {filesMeta.length > 0 && (
        <section className="space-y-3 pb-2">
          <h3 className="text-sm font-semibold text-foreground">Languages</h3>
          <LanguageBar filesMeta={filesMeta} />
        </section>
      )}
    </div>
  );
}
