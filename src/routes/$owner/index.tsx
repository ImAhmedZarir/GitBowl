import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { RepoCard } from "@/components/RepoCard";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/$owner/")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.owner} — GitBowl` },
      { name: "description", content: `Repositories published by ${params.owner} on GitBowl.` },
      { property: "og:title", content: `${params.owner} — GitBowl` },
      {
        property: "og:description",
        content: `Repositories published by ${params.owner} on GitBowl.`,
      },
    ],
  }),
  component: OwnerPage,
});

function OwnerPage() {
  const { owner } = Route.useParams();
  const { profile: me } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["owner", owner],
    queryFn: async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("username", owner)
        .maybeSingle();
      if (!profile) return null;
      const { data: repos } = await supabase
        .from("repositories")
        .select("*")
        .eq("owner_id", profile.id)
        .order("updated_at", { ascending: false });
      return { profile, repos: repos ?? [] };
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <p className="p-10 text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <h1 className="text-xl font-semibold">User not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">No GitBowl account named @{owner}.</p>
        </div>
      </div>
    );
  }

  const isMe = me?.id === data.profile.id;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-[260px_1fr]">
        <aside className="panel h-fit p-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-xl font-semibold text-primary-foreground">
            {data.profile.username.slice(0, 2).toUpperCase()}
          </div>
          <h1 className="mt-4 text-lg font-semibold">
            {data.profile.display_name ?? data.profile.username}
          </h1>
          <p className="text-sm text-muted-foreground">@{data.profile.username}</p>
          {data.profile.bio ? <p className="mt-3 text-sm">{data.profile.bio}</p> : null}
          <p className="mt-3 text-xs text-muted-foreground">
            Joined {new Date(data.profile.created_at).toLocaleDateString()}
          </p>
          {isMe ? (
            <Button asChild size="sm" className="mt-4 w-full">
              <Link to="/new">New repository</Link>
            </Button>
          ) : null}
        </aside>

        <section>
          <h2 className="mb-4 text-lg font-semibold">Repositories ({data.repos.length})</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.repos.map((repo) => (
              <RepoCard key={repo.id} repo={repo} owner={data.profile.username} />
            ))}
          </div>
          {!data.repos.length ? (
            <p className="text-sm text-muted-foreground">No repositories yet.</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
