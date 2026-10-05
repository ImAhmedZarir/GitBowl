// src/routes/docs.tsx
// Comprehensive Documentation for GitBowl
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Terminal,
  Key,
  Download,
  Upload,
  Edit3,
  BookOpen,
  Code2,
  GitBranch,
  Copy,
  Check,
  ChevronRight,
  Shield,
  Layers,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/docs")({
  head: () => {
    const canonicalUrl = "https://gitbowl.zone.id/docs";
    const ogImageUrl = "https://gitbowl.zone.id/og-image.png";

    const docsSchema = {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: "GitBowl Documentation & Developer Guides",
      description:
        "Comprehensive documentation for GitBowl: Git Smart-HTTP protocol, Personal Access Tokens, repository imports, and REST API.",
      author: {
        "@type": "Organization",
        name: "GitBowl",
        url: "https://gitbowl.zone.id/",
      },
      publisher: {
        "@type": "Organization",
        name: "GitBowl",
        url: "https://gitbowl.zone.id/",
      },
      url: canonicalUrl,
      mainEntityOfPage: canonicalUrl,
    };

    return {
      meta: [
        { title: "GitBowl Documentation — Git over HTTPS, Personal Tokens & REST API" },
        {
          name: "description",
          content:
            "Complete developer guides and documentation for GitBowl: Git Smart-HTTP commands, personal access tokens (PATs), GitHub migration, web code editor, and REST API.",
        },
        { property: "og:site_name", content: "GitBowl" },
        { property: "og:type", content: "article" },
        { property: "og:title", content: "GitBowl Documentation & Developer Guides" },
        {
          property: "og:description",
          content:
            "Learn how to clone, push, import, and collaborate using GitBowl. Guides for Git Smart-HTTP, access tokens, and API integration.",
        },
        { property: "og:url", content: canonicalUrl },
        { property: "og:image", content: ogImageUrl },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: "GitBowl Documentation & Developer Guides" },
        {
          name: "twitter:description",
          content:
            "Complete guides for Git over HTTPS, personal tokens, zip uploads, and REST API on GitBowl.",
        },
        { name: "twitter:image", content: ogImageUrl },
      ],
      links: [{ rel: "canonical", href: canonicalUrl }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(docsSchema),
        },
      ],
    };
  },
  component: DocsPage,
});

type DocSection =
  "getting-started" | "git-https" | "pats" | "import" | "zip-upload" | "web-editor" | "cli" | "api";

function DocsPage() {
  const [activeSection, setActiveSection] = useState<DocSection>("getting-started");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const navItems = [
    { id: "getting-started", label: "Getting Started", icon: BookOpen },
    { id: "git-https", label: "Git over HTTPS", icon: GitBranch },
    { id: "pats", label: "Personal Access Tokens", icon: Key },
    { id: "import", label: "Importing Repositories", icon: Download },
    { id: "zip-upload", label: "Zip Upload & Archives", icon: Upload },
    { id: "web-editor", label: "Web Code Editor", icon: Edit3 },
    { id: "cli", label: "GitBowl CLI (bowl)", icon: Terminal },
    { id: "api", label: "REST API Reference", icon: Code2 },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 md:py-12">
        {/* Hero Header */}
        <div className="border-b border-border pb-8 mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="border-primary/40 text-primary text-xs">
              Documentation
            </Badge>
            <span className="text-xs text-muted-foreground">Version 1.0</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            GitBowl Documentation
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-2 max-w-2xl">
            Everything you need to host, clone, commit, collaborate, and automate your code
            repositories on GitBowl.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* Navigation Sidebar */}
          <aside className="md:col-span-3 sticky top-20 rounded-xl border border-border/70 bg-card/60 backdrop-blur-sm p-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2">
              Topics
            </div>
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id as DocSection)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-all text-left ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5" />
                      {item.label}
                    </span>
                    {isActive && <ChevronRight className="h-3 w-3" />}
                  </button>
                );
              })}
            </nav>

            <div className="mt-6 pt-4 border-t border-border/60 px-3">
              <div className="text-xs font-semibold text-muted-foreground mb-2">Need help?</div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Have questions or encountered an issue? Join our community or email support.
              </p>
              <Button asChild variant="outline" size="sm" className="w-full mt-3 text-xs h-7">
                <Link to="/api/docs">Interactive API Spec</Link>
              </Button>
            </div>
          </aside>

          {/* Section Content */}
          <article className="md:col-span-9 space-y-8">
            {/* Getting Started */}
            {activeSection === "getting-started" && (
              <section className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight mb-2">
                    Getting Started with GitBowl
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    GitBowl provides native Git Smart-HTTP repository hosting, a browser Monaco code
                    editor, personal access tokens, and a complete GitHub-compatible REST API.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl border border-border bg-card">
                    <div className="flex items-center gap-2 mb-2 font-semibold text-sm">
                      <Shield className="h-4 w-4 text-emerald-500" />
                      1. Create your Account
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Sign up with your verified email address to claim your unique developer
                      username and begin hosting code.
                    </p>
                  </div>
                  <div className="p-4 rounded-xl border border-border bg-card">
                    <div className="flex items-center gap-2 mb-2 font-semibold text-sm">
                      <Layers className="h-4 w-4 text-primary" />
                      2. Create a Repository
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Initialize a brand new Git repository, import from GitHub, or upload a project
                      zip archive with instant extraction.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-5">
                  <h3 className="text-sm font-semibold mb-3">Quick Clone Example</h3>
                  <div className="relative group">
                    <pre className="bg-neutral-950 text-neutral-100 text-xs font-mono p-4 rounded-lg overflow-x-auto border border-neutral-800">
                      git clone https://gitbowl.lovable.app/your-username/my-project.git
                    </pre>
                    <button
                      onClick={() =>
                        copyToClipboard(
                          "git clone https://gitbowl.lovable.app/your-username/my-project.git",
                          "clone-quick",
                        )
                      }
                      className="absolute top-3 right-3 p-1.5 rounded-md bg-neutral-800 text-neutral-300 hover:text-white transition-opacity opacity-0 group-hover:opacity-100"
                    >
                      {copiedKey === "clone-quick" ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* Git over HTTPS */}
            {activeSection === "git-https" && (
              <section className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight mb-2">Git over HTTPS</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    GitBowl provides full Git Smart-HTTP compatibility (`git-upload-pack` and
                    `git-receive-pack`). You can use standard command-line `git` client without any
                    special plugins.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-border bg-card">
                    <h3 className="text-sm font-semibold mb-2">Cloning a Repository</h3>
                    <p className="text-xs text-muted-foreground mb-3">
                      Clone public or private repositories over standard HTTPS:
                    </p>
                    <pre className="bg-neutral-950 text-neutral-100 text-xs font-mono p-3 rounded-lg overflow-x-auto border border-neutral-800">
                      git clone https://gitbowl.lovable.app/username/repository.git
                    </pre>
                  </div>

                  <div className="p-4 rounded-xl border border-border bg-card">
                    <h3 className="text-sm font-semibold mb-2">Pushing Changes</h3>
                    <p className="text-xs text-muted-foreground mb-3">
                      When prompted for credentials in terminal:
                    </p>
                    <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-5">
                      <li>
                        <strong className="text-foreground">Username:</strong> Your GitBowl username
                        or primary account email
                      </li>
                      <li>
                        <strong className="text-foreground">Password:</strong> Your Personal Access
                        Token starting with{" "}
                        <code className="bg-muted px-1 rounded text-primary">gbp_...</code>
                      </li>
                    </ul>
                  </div>
                </div>
              </section>
            )}

            {/* Personal Access Tokens */}
            {activeSection === "pats" && (
              <section className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight mb-2">
                    Personal Access Tokens (PATs)
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Personal Access Tokens provide secure authentication for Git CLI operations and
                    REST API calls without exposing your primary account password.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                  <h3 className="text-sm font-semibold">Generating a Token</h3>
                  <ol className="text-xs text-muted-foreground space-y-2 list-decimal pl-5">
                    <li>
                      Go to your profile avatar menu and click <strong>Settings</strong>.
                    </li>
                    <li>
                      Select the <strong>Access Tokens</strong> tab from the sidebar.
                    </li>
                    <li>
                      Click <strong>Generate New Token</strong>.
                    </li>
                    <li>
                      Select required scopes (e.g.,{" "}
                      <code className="bg-muted px-1 rounded">repo:read</code>,{" "}
                      <code className="bg-muted px-1 rounded">repo:write</code>,{" "}
                      <code className="bg-muted px-1 rounded">repo:delete</code>).
                    </li>
                    <li>
                      Copy your token immediately. For security, GitBowl only stores SHA-256 hashes
                      of tokens and cannot display the raw token again.
                    </li>
                  </ol>
                  <div className="mt-4">
                    <Button asChild size="sm" variant="outline" className="text-xs">
                      <Link to="/settings">
                        Open Token Settings <ArrowRight className="ml-1 h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </section>
            )}

            {/* Importing Repositories */}
            {activeSection === "import" && (
              <section className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight mb-2">Importing Repositories</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Migrate repositories from GitHub or other Git providers directly into GitBowl
                    with complete commit histories and full file contents.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                  <h3 className="text-sm font-semibold">Import from GitHub</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Navigate to{" "}
                    <Link to="/new" className="text-primary hover:underline">
                      New Repository
                    </Link>{" "}
                    and select the <strong>Import</strong> tab. Provide the GitHub owner and
                    repository name (or full GitHub URL). GitBowl pulls the full tree and
                    synchronizes files instantly.
                  </p>
                </div>
              </section>
            )}

            {/* Zip Upload & Archives */}
            {activeSection === "zip-upload" && (
              <section className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight mb-2">
                    Zip Upload & Project Unzipping
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Upload complete project zip files without needing Git installed. GitBowl parses
                    and unpacks the zip client-side and server-side, committing all files
                    atomically.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                  <h3 className="text-sm font-semibold">Downloading Repository Archives</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Every repository provides instant zip archive downloads. Simply click the{" "}
                    <strong>Code</strong> dropdown on any repository page and select{" "}
                    <strong>Download ZIP</strong>.
                  </p>
                </div>
              </section>
            )}

            {/* Web Code Editor */}
            {activeSection === "web-editor" && (
              <section className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight mb-2">Web Code Editor</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Edit files directly in the browser with full Monaco syntax highlighting,
                    autocomplete, file creation, renaming, and commit generation.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-border bg-card space-y-2">
                  <h3 className="text-sm font-semibold">Atomic Commits</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Each web edit creates a genuine Git commit with real SHA-1 hashes, directory
                    tree structures, and author metadata. When you clone the repository locally, web
                    edits appear seamlessly in your{" "}
                    <code className="bg-muted px-1 rounded">git log</code>.
                  </p>
                </div>
              </section>
            )}

            {/* GitBowl CLI */}
            {activeSection === "cli" && (
              <section className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight mb-2">
                    GitBowl CLI Tool (`bowl`)
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    The standalone `bowl` command-line utility lets you create repositories, clone
                    projects, manage personal tokens, and run diagnostics right from your shell.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-border bg-card">
                    <h3 className="text-sm font-semibold mb-2">Installation</h3>
                    <pre className="bg-neutral-950 text-neutral-100 text-xs font-mono p-3 rounded-lg overflow-x-auto border border-neutral-800">
                      npm install -g @gitbowl/cli
                    </pre>
                  </div>

                  <div className="p-4 rounded-xl border border-border bg-card">
                    <h3 className="text-sm font-semibold mb-2">Common Commands</h3>
                    <div className="space-y-2 text-xs font-mono">
                      <div className="p-2 rounded bg-muted/50">bowl login</div>
                      <div className="p-2 rounded bg-muted/50">
                        bowl repo create my-app --public
                      </div>
                      <div className="p-2 rounded bg-muted/50">bowl clone username/my-app</div>
                      <div className="p-2 rounded bg-muted/50">
                        bowl token create --name "ci-token"
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* REST API Reference */}
            {activeSection === "api" && (
              <section className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight mb-2">
                    GitHub-Compatible REST API v1
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    GitBowl exposes a v1 REST API mirroring standard GitHub endpoints. Authenticate
                    requests using{" "}
                    <code className="bg-muted px-1 rounded">Authorization: Bearer gbp_...</code>.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="p-4 rounded-xl border border-border bg-card">
                    <div className="flex items-center gap-2 mb-2 font-mono text-xs">
                      <Badge variant="outline" className="text-emerald-500 border-emerald-500/40">
                        GET
                      </Badge>
                      <span>/api/v1/user</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Returns the authenticated user profile.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-border bg-card">
                    <div className="flex items-center gap-2 mb-2 font-mono text-xs">
                      <Badge variant="outline" className="text-emerald-500 border-emerald-500/40">
                        GET
                      </Badge>
                      <span>/api/v1/user/repos</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      List repositories for the authenticated user.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-border bg-card">
                    <div className="flex items-center gap-2 mb-2 font-mono text-xs">
                      <Badge variant="outline" className="text-blue-500 border-blue-500/40">
                        POST
                      </Badge>
                      <span>/api/v1/user/repos</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Create a new repository for the authenticated user.
                    </p>
                  </div>
                </div>

                <div>
                  <Button asChild>
                    <Link to="/api/docs">
                      View Full Interactive API Specification{" "}
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </section>
            )}
          </article>
        </div>
      </main>

      <Footer />
    </div>
  );
}
