import { createFileRoute, Link } from "@tanstack/react-router";
import { GitPullRequest, Search } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/pulls")({
  head: () => ({
    meta: [
      { title: "Pull Requests — GitBowl" },
      { name: "description", content: "Review and manage your pull requests on GitBowl." },
    ],
  }),
  component: PullsPage,
});

function PullsPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col justify-between">
      <Header />
      <main className="mx-auto w-full max-w-7xl px-4 py-8 flex-1">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-border">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Pull Requests</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review code contributions and merge incoming branches.
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-border bg-card p-12 text-center text-xs text-muted-foreground shadow-xs">
          <GitPullRequest className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
          <h2 className="text-sm font-semibold text-foreground">No open pull requests</h2>
          <p className="mt-1 max-w-md mx-auto leading-relaxed">
            There aren&apos;t any open pull requests right now. Create a new branch and push your
            commits to open a pull request.
          </p>
          <Button asChild size="sm" className="mt-5">
            <Link to="/explore">Explore repositories</Link>
          </Button>
        </div>
      </main>
      <Footer />
    </div>
  );
}
