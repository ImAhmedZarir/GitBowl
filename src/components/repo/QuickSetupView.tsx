import { useState } from "react";
import { Terminal, Copy, Check, FilePlus, Upload, KeyRound, Globe, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface QuickSetupViewProps {
  owner: string;
  repoName: string;
  defaultBranch?: string;
  onNewFile: () => void;
  onUploadFiles: () => void;
}

export function QuickSetupView({
  owner,
  repoName,
  defaultBranch = "main",
  onNewFile,
  onUploadFiles,
}: QuickSetupViewProps) {
  const [protocol, setProtocol] = useState<"https" | "ssh">("https");
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  const httpsUrl = `https://gitbowl.zone.id/${owner}/${repoName}.git`;
  const sshUrl = `git@gitbowl.zone.id:${owner}/${repoName}.git`;
  const activeUrl = protocol === "https" ? httpsUrl : sshUrl;

  const newRepoScript = [
    `echo "# ${repoName}" >> README.md`,
    `git init`,
    `git add README.md`,
    `git commit -m "first commit"`,
    `git branch -M ${defaultBranch}`,
    `git remote add origin ${activeUrl}`,
    `git push -u origin ${defaultBranch}`,
  ].join("\n");

  const existingRepoScript = [
    `git remote add origin ${activeUrl}`,
    `git branch -M ${defaultBranch}`,
    `git push -u origin ${defaultBranch}`,
  ].join("\n");

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(label);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopiedSnippet(null), 2000);
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-2">
      {/* Top Banner Card */}
      <div className="rounded-xl border border-white/[0.08] bg-zinc-950/80 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Terminal className="h-4 w-4 text-zinc-400" />
              <span>Quick setup — if you&apos;ve done this kind of thing before</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Push code directly from your command line terminal or import files into this bowl.
            </p>
          </div>

          {/* Protocol Switcher & Copy URL */}
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-white/[0.1] bg-black p-0.5">
              <button
                type="button"
                onClick={() => setProtocol("https")}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  protocol === "https"
                    ? "bg-white text-black font-semibold shadow-xs"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                HTTPS
              </button>
              <button
                type="button"
                onClick={() => setProtocol("ssh")}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  protocol === "ssh"
                    ? "bg-white text-black font-semibold shadow-xs"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                SSH
              </button>
            </div>

            <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-black px-2.5 py-1">
              <span className="font-mono text-xs text-zinc-300 truncate max-w-[220px] sm:max-w-[320px]">
                {activeUrl}
              </span>
              <button
                type="button"
                onClick={() => copyText(activeUrl, "Clone URL")}
                className="text-zinc-400 hover:text-white transition-colors"
                title="Copy repository URL"
              >
                {copiedSnippet === "Clone URL" ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Authentication notice */}
        <div className="mt-4 flex items-center gap-2 text-[11px] text-zinc-400 border-t border-white/[0.06] pt-3">
          <KeyRound className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
          <span>
            Authenticate with your GitBowl account password or personal access token (PAT) when pushing over HTTPS.
          </span>
        </div>
      </div>

      {/* Code Blocks */}
      <div className="space-y-4">
        {/* Step 1: Create a new repo */}
        <div className="rounded-xl border border-white/[0.08] bg-zinc-950/60 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-white">
              …or create a new repository on the command line
            </h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyText(newRepoScript, "Init commands")}
              className="h-7 px-2 text-xs text-zinc-400 hover:text-white gap-1.5"
            >
              {copiedSnippet === "Init commands" ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy</span>
                </>
              )}
            </Button>
          </div>
          <pre className="p-3.5 rounded-lg bg-black border border-white/[0.08] font-mono text-xs text-zinc-200 overflow-x-auto leading-relaxed">
            {newRepoScript}
          </pre>
        </div>

        {/* Step 2: Push an existing repo */}
        <div className="rounded-xl border border-white/[0.08] bg-zinc-950/60 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-white">
              …or push an existing repository from the command line
            </h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyText(existingRepoScript, "Push commands")}
              className="h-7 px-2 text-xs text-zinc-400 hover:text-white gap-1.5"
            >
              {copiedSnippet === "Push commands" ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy</span>
                </>
              )}
            </Button>
          </div>
          <pre className="p-3.5 rounded-lg bg-black border border-white/[0.08] font-mono text-xs text-zinc-200 overflow-x-auto leading-relaxed">
            {existingRepoScript}
          </pre>
        </div>

        {/* Step 3: Web-based creation */}
        <div className="rounded-xl border border-white/[0.08] bg-zinc-950/60 p-5">
          <h4 className="text-xs font-semibold text-white mb-2">
            …or start directly in your browser
          </h4>
          <p className="text-xs text-zinc-400 mb-4">
            Initialize this repository with a README or upload files directly from your computer.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              onClick={onNewFile}
              className="h-8 gap-1.5 text-xs bg-white text-black hover:bg-zinc-200 font-semibold"
            >
              <FilePlus className="h-3.5 w-3.5" />
              <span>Create new file</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onUploadFiles}
              className="h-8 gap-1.5 text-xs border-white/[0.12] bg-white/[0.04] text-white hover:bg-white/[0.08]"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Upload files</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
