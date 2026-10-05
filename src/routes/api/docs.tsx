// src/routes/api/docs.tsx
// Interactive REST API Reference & Documentation
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Code2,
  FileCode,
  ExternalLink,
  Copy,
  Check,
  Search,
  BookOpen,
  Terminal,
  Shield,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/api/docs")({
  head: () => ({
    meta: [
      { title: "REST API Documentation — GitBowl" },
      {
        name: "description",
        content: "Complete documentation for the GitBowl GitHub-compatible REST API v1.",
      },
    ],
  }),
  component: ApiDocsPage,
});

interface ApiEndpoint {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  summary: string;
  description: string;
  authRequired: boolean;
  rateLimit: string;
  sampleCurl: string;
}

const ENDPOINTS: ApiEndpoint[] = [
  {
    method: "GET",
    path: "/api/v1/user",
    summary: "Get authenticated user",
    description: "Returns profile information for the user authenticated by the bearer token.",
    authRequired: true,
    rateLimit: "5,000 / hour",
    sampleCurl: `curl -H "Authorization: Bearer gbp_your_pat" https://gitbowl.dev/api/v1/user`,
  },
  {
    method: "GET",
    path: "/api/v1/user/repos",
    summary: "List user repositories",
    description: "List repositories that the authenticated user owns.",
    authRequired: true,
    rateLimit: "5,000 / hour",
    sampleCurl: `curl -H "Authorization: Bearer gbp_your_pat" https://gitbowl.dev/api/v1/user/repos`,
  },
  {
    method: "POST",
    path: "/api/v1/user/repos",
    summary: "Create repository",
    description: "Create a new repository for the authenticated user.",
    authRequired: true,
    rateLimit: "5,000 / hour",
    sampleCurl: `curl -X POST -H "Authorization: Bearer gbp_your_pat" -H "Content-Type: application/json" -d '{"name":"my-project","private":false}' https://gitbowl.dev/api/v1/user/repos`,
  },
  {
    method: "GET",
    path: "/api/v1/repos/{owner}/{repo}",
    summary: "Get repository",
    description: "Retrieve metadata for a repository.",
    authRequired: false,
    rateLimit: "60 / hr (unauth) | 5,000 / hr (auth)",
    sampleCurl: `curl https://gitbowl.dev/api/v1/repos/octocat/hello-world`,
  },
  {
    method: "GET",
    path: "/api/v1/repos/{owner}/{repo}/commits",
    summary: "List commits",
    description: "List commit history for a repository in reverse chronological order.",
    authRequired: false,
    rateLimit: "60 / hr (unauth) | 5,000 / hr (auth)",
    sampleCurl: `curl https://gitbowl.dev/api/v1/repos/octocat/hello-world/commits`,
  },
  {
    method: "GET",
    path: "/api/v1/repos/{owner}/{repo}/branches",
    summary: "List branches",
    description: "List all branches with their head commit SHAs.",
    authRequired: false,
    rateLimit: "60 / hr (unauth) | 5,000 / hr (auth)",
    sampleCurl: `curl https://gitbowl.dev/api/v1/repos/octocat/hello-world/branches`,
  },
  {
    method: "GET",
    path: "/api/v1/repos/{owner}/{repo}/contents/{path}",
    summary: "Get file contents",
    description: "Fetch file contents base64-encoded or list directory items.",
    authRequired: false,
    rateLimit: "60 / hr (unauth) | 5,000 / hr (auth)",
    sampleCurl: `curl https://gitbowl.dev/api/v1/repos/octocat/hello-world/contents/README.md`,
  },
  {
    method: "PUT",
    path: "/api/v1/repos/{owner}/{repo}/contents/{path}",
    summary: "Create or update file",
    description: "Creates or updates a file in the repository and generates a commit.",
    authRequired: true,
    rateLimit: "5,000 / hour",
    sampleCurl: `curl -X PUT -H "Authorization: Bearer gbp_your_pat" -H "Content-Type: application/json" -d '{"message":"Update README","content":"SGVsbG8gV29ybGQh"}' https://gitbowl.dev/api/v1/repos/octocat/hello-world/contents/README.md`,
  },
  {
    method: "GET",
    path: "/api/v1/repos/{owner}/{repo}/pulls",
    summary: "List pull requests",
    description: "List pull requests for a repository.",
    authRequired: false,
    rateLimit: "60 / hr (unauth) | 5,000 / hr (auth)",
    sampleCurl: `curl https://gitbowl.dev/api/v1/repos/octocat/hello-world/pulls?state=open`,
  },
  {
    method: "POST",
    path: "/api/v1/repos/{owner}/{repo}/pulls",
    summary: "Create pull request",
    description: "Create a new pull request between branches.",
    authRequired: true,
    rateLimit: "5,000 / hour",
    sampleCurl: `curl -X POST -H "Authorization: Bearer gbp_your_pat" -H "Content-Type: application/json" -d '{"title":"Feature A","head":"feature-a","base":"main"}' https://gitbowl.dev/api/v1/repos/octocat/hello-world/pulls`,
  },
];

function ApiDocsPage() {
  const [filter, setFilter] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const filtered = ENDPOINTS.filter(
    (e) =>
      e.path.toLowerCase().includes(filter.toLowerCase()) ||
      e.summary.toLowerCase().includes(filter.toLowerCase()) ||
      e.method.toLowerCase().includes(filter.toLowerCase()),
  );

  function copyCurl(text: string, index: number) {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    toast.success("Copied cURL command to clipboard");
    setTimeout(() => setCopiedIndex(null), 2000);
  }

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between">
      <div>
        <Header />
        <div className="mx-auto max-w-7xl px-4 py-8 space-y-8">
          {/* Hero Banner */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-border">
            <div>
              <div className="flex items-center gap-2">
                <Code2 className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  GitBowl REST API v1
                </h1>
                <Badge variant="outline" className="text-xs">
                  v1.0.0
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground max-w-2xl">
                Standard GitHub-compatible REST API. Supports Personal Access Tokens (PATs) and rate
                limits of 5,000 req/hr for authenticated requests.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                <a href="/api/v1/openapi.json" target="_blank" rel="noreferrer">
                  <FileCode className="h-3.5 w-3.5" />
                  <span>OpenAPI Spec</span>
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </a>
              </Button>
              <Button asChild size="sm" className="h-8 text-xs gap-1.5">
                <Link to="/settings" search={{ tab: "tokens" } as any}>
                  <Shield className="h-3.5 w-3.5" />
                  <span>Generate Token</span>
                </Link>
              </Button>
            </div>
          </div>

          {/* Authentication & Rate Limiting Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-border bg-card shadow-xs space-y-1">
              <h3 className="text-xs font-semibold text-foreground">Authentication</h3>
              <p className="text-xs text-muted-foreground font-mono">
                Authorization: Bearer gbp_...
              </p>
              <p className="text-[11px] text-muted-foreground pt-1">
                Pass Personal Access Tokens with the prefix{" "}
                <code className="text-primary font-bold">gbp_</code>.
              </p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-card shadow-xs space-y-1">
              <h3 className="text-xs font-semibold text-foreground">Rate Limits</h3>
              <p className="text-xs text-muted-foreground font-mono">
                5,000 / hr (Auth) · 60 / hr (Anon)
              </p>
              <p className="text-[11px] text-muted-foreground pt-1">
                Tracked via <code className="text-foreground">X-RateLimit-Remaining</code> and reset
                headers.
              </p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-card shadow-xs space-y-1">
              <h3 className="text-xs font-semibold text-foreground">GitHub Compatibility</h3>
              <p className="text-xs text-muted-foreground font-mono">Drop-in compatible schemas</p>
              <p className="text-[11px] text-muted-foreground pt-1">
                Use with existing Octokit scripts or standard GitHub API SDKs.
              </p>
            </div>
          </div>

          {/* Endpoint Filter */}
          <div className="space-y-4">
            <div className="relative max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Filter endpoints by method or path..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>

            {/* Endpoints List */}
            <div className="space-y-3">
              {filtered.map((ep, i) => {
                const methodColor =
                  ep.method === "GET"
                    ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                    : ep.method === "POST"
                      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                      : ep.method === "PUT"
                        ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                        : ep.method === "DELETE"
                          ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
                          : "bg-purple-500/10 text-purple-500 border-purple-500/20";

                return (
                  <div
                    key={ep.path + ep.method}
                    className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-xs"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-mono text-xs">
                        <span
                          className={`px-2 py-0.5 rounded-md font-bold text-[11px] border ${methodColor}`}
                        >
                          {ep.method}
                        </span>
                        <span className="font-semibold text-foreground">{ep.path}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {ep.authRequired && (
                          <Badge variant="outline" className="text-[10px] text-amber-500">
                            Auth Required
                          </Badge>
                        )}
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {ep.rateLimit}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">{ep.description}</p>

                    {/* Sample cURL command */}
                    <div className="relative rounded-lg bg-muted/60 p-2.5 font-mono text-[11px] text-foreground overflow-x-auto flex items-center justify-between">
                      <code className="pr-8">{ep.sampleCurl}</code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyCurl(ep.sampleCurl, i)}
                        className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-foreground"
                        title="Copy command"
                      >
                        {copiedIndex === i ? (
                          <Check className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
