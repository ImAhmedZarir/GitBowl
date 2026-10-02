import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Input } from "@/components/ui/input";
import { RepoCard } from "@/components/RepoCard";

export const Route = createFileRoute("/explore")({
  head: () => ({
    meta: [
      { title: "Explore repositories — GitBowl" },
      {
        name: "description",
        content:
          "Browse public repositories hosted on GitBowl and find code to fork, star or clone.",
      },
      { property: "og:title", content: "Explore repositories — GitBowl" },
      { property: "og:description", content: "Browse public repositories hosted on GitBowl." },
    ],
  }),
  component: Explore,
});

function Explore() {
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["explore", q],
    queryFn: async () => {
      let query = supabase
        .from("repositories")
        .select("*, profiles!repositories_owner_id_fkey(username)")
        .eq("is_private", false)
        .order("updated_at", { ascending: false })
        .limit(60);
      if (q.trim()) query = query.ilike("name", `%${q.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-7xl px-4 py-10">
        <h1 className="text-2xl font-semibold">Explore</h1>
        <p className="mt-1 text-sm text-muted-foreground">Public repositories on GitBowl.</p>

        <div className="relative mt-6 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search repositories"
            className="pl-9"
          />
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {data?.map((repo) => (
            <RepoCard key={repo.id} repo={repo} owner={repo.profiles?.username} />
          ))}
        </div>
        {!isLoading && !data?.length ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">No repositories found.</p>
        ) : null}
      </div>
    </div>
  );
}
