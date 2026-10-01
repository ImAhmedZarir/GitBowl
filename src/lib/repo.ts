import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";

export type RepoFile = {
  id: string;
  repo_id: string;
  path: string;
  content: string;
  is_binary: boolean;
  size: number;
  updated_at: string;
};

export type TreeNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: TreeNode[];
  file?: RepoFile;
};

const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|mp4|mp3|wav|woff2?|ttf|eot|exe|dll|bin|jar|class|so|dylib)$/i;

export function isBinaryPath(path: string) {
  return BINARY_EXT.test(path);
}

export function languageFor(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    css: "css",
    scss: "scss",
    html: "html",
    md: "markdown",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    c: "c",
    h: "c",
    cpp: "cpp",
    cs: "csharp",
    php: "php",
    sh: "shell",
    bash: "shell",
    yml: "yaml",
    yaml: "yaml",
    sql: "sql",
    toml: "ini",
    xml: "xml",
    svg: "xml",
  };
  return map[ext] ?? "plaintext";
}

export function buildTree(files: RepoFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  for (const file of sorted) {
    const parts = file.path.split("/").filter(Boolean);
    let level = root;
    let acc = "";
    parts.forEach((part, i) => {
      acc = acc ? `${acc}/${part}` : part;
      const isLeaf = i === parts.length - 1;
      let node = level.find((n) => n.name === part && n.type === (isLeaf ? "file" : "folder"));
      if (!node) {
        node = isLeaf
          ? { name: part, path: acc, type: "file", file }
          : { name: part, path: acc, type: "folder", children: [] };
        level.push(node);
      }
      if (!isLeaf) level = node.children!;
    });
  }
  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
    nodes.sort((a, b) =>
      a.type === b.type ? a.name.localeCompare(b.name) : a.type === "folder" ? -1 : 1,
    );
    nodes.forEach((n) => n.children && sortNodes(n.children));
    return nodes;
  };
  return sortNodes(root);
}

export async function readUploadedFile(
  file: File,
): Promise<{ content: string; isBinary: boolean }> {
  if (isBinaryPath(file.name)) {
    const buf = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    return { content: btoa(binary), isBinary: true };
  }
  return { content: await file.text(), isBinary: false };
}

export async function filesFromZip(
  file: File,
): Promise<{ path: string; content: string; isBinary: boolean }[]> {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((e) => !e.dir);
  const commonRoot = detectCommonRoot(entries.map((e) => e.name));
  const out: { path: string; content: string; isBinary: boolean }[] = [];
  for (const entry of entries) {
    if (entry.name.includes("__MACOSX/") || entry.name.endsWith(".DS_Store")) continue;
    const path = commonRoot ? entry.name.slice(commonRoot.length + 1) : entry.name;
    if (!path) continue;
    if (isBinaryPath(path)) {
      out.push({ path, content: await entry.async("base64"), isBinary: true });
    } else {
      out.push({ path, content: await entry.async("string"), isBinary: false });
    }
  }
  return out;
}

function detectCommonRoot(names: string[]) {
  const tops = new Set(names.map((n) => n.split("/")[0]));
  if (tops.size !== 1) return null;
  const top = [...tops][0]!;
  return names.every((n) => n.startsWith(`${top}/`)) ? top : null;
}

export async function downloadRepoZip(repoName: string, files: RepoFile[]) {
  const zip = new JSZip();
  for (const f of files) {
    if (f.is_binary) zip.file(f.path, f.content, { base64: true });
    else zip.file(f.path, f.content);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${repoName}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Copies a repository (and all files) into the signed-in user's account. */
export async function copyRepository(opts: {
  sourceRepoId: string;
  newOwnerId: string;
  newName: string;
  description: string | null;
  isFork: boolean;
}) {
  const { data: files, error: filesError } = await supabase
    .from("repo_files")
    .select("path, content, is_binary, size")
    .eq("repo_id", opts.sourceRepoId);
  if (filesError) throw filesError;

  const { data: repo, error } = await supabase
    .from("repositories")
    .insert({
      owner_id: opts.newOwnerId,
      name: opts.newName,
      description: opts.description,
      forked_from: opts.isFork ? opts.sourceRepoId : null,
    })
    .select()
    .single();
  if (error) throw error;

  if (files?.length) {
    const { error: insertError } = await supabase
      .from("repo_files")
      .insert(files.map((f) => ({ ...f, repo_id: repo.id })));
    if (insertError) throw insertError;
  }

  await supabase.from("commits").insert({
    repo_id: repo.id,
    author_id: opts.newOwnerId,
    message: opts.isFork ? "Forked repository" : "Cloned repository",
    changes: (files ?? []).map((f) => ({ path: f.path, type: "added" })),
  });

  if (opts.isFork) {
    await supabase.rpc("increment_fork_count", { _repo_id: opts.sourceRepoId });
  }

  return repo;
}
