import { useMemo } from "react";
import type { RepoFileMeta } from "@/lib/repo-queries";

interface LanguageBarProps {
  filesMeta: RepoFileMeta[];
}

interface LangStat {
  name: string;
  color: string;
  bytes: number;
  percentage: number;
}

const EXTENSION_MAP: Record<string, { name: string; color: string }> = {
  ts: { name: "TypeScript", color: "#3178c6" },
  tsx: { name: "TypeScript", color: "#3178c6" },
  js: { name: "JavaScript", color: "#f7df1e" },
  jsx: { name: "JavaScript", color: "#f7df1e" },
  mjs: { name: "JavaScript", color: "#f7df1e" },
  cjs: { name: "JavaScript", color: "#f7df1e" },
  py: { name: "Python", color: "#3572A5" },
  rs: { name: "Rust", color: "#dea584" },
  go: { name: "Go", color: "#00ADD8" },
  html: { name: "HTML", color: "#e34c26" },
  css: { name: "CSS", color: "#563d7c" },
  scss: { name: "SCSS", color: "#c6538c" },
  json: { name: "JSON", color: "#22c55e" },
  yaml: { name: "YAML", color: "#cb171e" },
  yml: { name: "YAML", color: "#cb171e" },
  toml: { name: "TOML", color: "#9c4221" },
  md: { name: "Markdown", color: "#083fa1" },
  sh: { name: "Shell", color: "#89e051" },
  bash: { name: "Shell", color: "#89e051" },
  zsh: { name: "Shell", color: "#89e051" },
  sql: { name: "SQL", color: "#e38c00" },
  c: { name: "C", color: "#555555" },
  cpp: { name: "C++", color: "#f34b7d" },
  h: { name: "C Header", color: "#555555" },
  hpp: { name: "C++ Header", color: "#f34b7d" },
  java: { name: "Java", color: "#b07219" },
  kt: { name: "Kotlin", color: "#A97BFF" },
  kts: { name: "Kotlin", color: "#A97BFF" },
  swift: { name: "Swift", color: "#F05138" },
  dart: { name: "Dart", color: "#00B4AB" },
  cs: { name: "C#", color: "#178600" },
  php: { name: "PHP", color: "#4F5D95" },
  rb: { name: "Ruby", color: "#701516" },
  vue: { name: "Vue", color: "#41b883" },
  svelte: { name: "Svelte", color: "#ff3e00" },
  astro: { name: "Astro", color: "#ff5d01" },
  sol: { name: "Solidity", color: "#aa6746" },
  lua: { name: "Lua", color: "#000080" },
  proto: { name: "Protocol Buffer", color: "#4f5d95" },
  xml: { name: "XML", color: "#0060ac" },
  gradle: { name: "Gradle", color: "#02303a" },
};

const VENDOR_REGEX =
  /^(node_modules|dist|build|\.git|vendor|target|out|coverage|\.next|\.output|bower_components)\//i;

export function LanguageBar({ filesMeta }: LanguageBarProps) {
  const stats = useMemo<LangStat[]>(() => {
    if (!filesMeta || filesMeta.length === 0) return [];

    const map = new Map<string, { name: string; color: string; bytes: number }>();
    let totalBytes = 0;

    for (const f of filesMeta) {
      if (!f?.path) continue;
      // Exclude vendored/build directories and lockfiles
      if (VENDOR_REGEX.test(f.path) || f.path.endsWith(".lock") || f.path.endsWith("-lock.json")) {
        continue;
      }

      const size = Math.max(f.size || 50, 10);
      const ext = f.path.split(".").pop()?.toLowerCase() || "";
      const lang = EXTENSION_MAP[ext] || { name: "Other", color: "#71717a" };

      totalBytes += size;
      const existing = map.get(lang.name);
      if (existing) {
        existing.bytes += size;
      } else {
        map.set(lang.name, { name: lang.name, color: lang.color, bytes: size });
      }
    }

    if (totalBytes === 0) return [];

    const list: LangStat[] = [];
    for (const item of map.values()) {
      const percentage = Number(((item.bytes / totalBytes) * 100).toFixed(1));
      if (percentage >= 0.5) {
        list.push({ ...item, percentage });
      }
    }

    list.sort((a, b) => b.bytes - a.bytes);
    return list;
  }, [filesMeta]);

  if (stats.length === 0) return null;

  return (
    <div className="space-y-2 py-1">
      {/* Segmented Color Bar */}
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted/60 border border-border">
        {stats.map((s) => (
          <div
            key={s.name}
            style={{ width: `${s.percentage}%`, backgroundColor: s.color }}
            className="h-full transition-all duration-300"
            title={`${s.name}: ${s.percentage}%`}
          />
        ))}
      </div>

      {/* Language Legends */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {stats.slice(0, 6).map((s) => (
          <div key={s.name} className="flex items-center gap-1.5 font-medium">
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-foreground">{s.name}</span>
            <span className="text-muted-foreground font-mono text-[11px]">{s.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
