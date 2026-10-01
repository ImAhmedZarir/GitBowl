import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Search,
  BookMarked,
  Plus,
  Compass,
  User,
  Moon,
  Sun,
  Laptop,
  Lock,
  Globe,
  ExternalLink,
} from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SearchRepo {
  id: string;
  name: string;
  description: string | null;
  is_private: boolean;
  owner_username: string;
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [repos, setRepos] = useState<SearchRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  useEffect(() => {
    if (!open) return;
    let active = true;

    async function searchRepos() {
      setLoading(true);
      try {
        let req = supabase
          .from("repositories")
          .select(
            "id, name, description, is_private, profiles!repositories_owner_id_fkey(username)",
          )
          .limit(8);

        if (query.trim()) {
          req = req.ilike("name", `%${query.trim()}%`);
        }

        const { data, error } = await req;
        if (!error && data && active) {
          const formatted: SearchRepo[] = data.map((r: any) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            is_private: r.is_private,
            owner_username: r.profiles?.username || "unknown",
          }));
          setRepos(formatted);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (active) setLoading(false);
      }
    }

    const timer = setTimeout(searchRepos, query ? 200 : 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, open]);

  function handleSelect(callback: () => void) {
    onOpenChange(false);
    callback();
  }

  function toggleTheme(theme: "light" | "dark" | "system") {
    const root = document.documentElement;
    if (theme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", prefersDark);
      localStorage.removeItem("gitbowl-theme");
    } else {
      root.classList.toggle("dark", theme === "dark");
      localStorage.setItem("gitbowl-theme", theme);
    }
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Type a command or search repositories..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results found for &ldquo;{query}&rdquo;.</CommandEmpty>

        {repos.length > 0 && (
          <CommandGroup heading="Repositories">
            {repos.map((repo) => (
              <CommandItem
                key={repo.id}
                value={`${repo.owner_username}/${repo.name}`}
                onSelect={() =>
                  handleSelect(() =>
                    navigate({
                      to: "/$owner/$repo",
                      params: { owner: repo.owner_username, repo: repo.name },
                    }),
                  )
                }
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <BookMarked className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-foreground">
                    {repo.owner_username}
                    <span className="text-muted-foreground">/</span>
                    {repo.name}
                  </span>
                  {repo.description && (
                    <span className="max-w-[240px] truncate text-xs text-muted-foreground">
                      {repo.description}
                    </span>
                  )}
                </div>
                {repo.is_private ? (
                  <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    <Lock className="h-2.5 w-2.5" /> Private
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    <Globe className="h-2.5 w-2.5" /> Public
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />

        <CommandGroup heading="Navigation">
          <CommandItem
            value="explore explore repositories"
            onSelect={() => handleSelect(() => navigate({ to: "/explore" }))}
          >
            <Compass className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Explore Repositories</span>
          </CommandItem>
          {user ? (
            <>
              <CommandItem
                value="new create new repository"
                onSelect={() => handleSelect(() => navigate({ to: "/new" }))}
              >
                <Plus className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>Create New Repository</span>
              </CommandItem>
              {profile && (
                <CommandItem
                  value="profile your profile repositories"
                  onSelect={() =>
                    handleSelect(() =>
                      navigate({ to: "/$owner", params: { owner: profile.username } }),
                    )
                  }
                >
                  <User className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>Your Profile (@{profile.username})</span>
                </CommandItem>
              )}
            </>
          ) : (
            <CommandItem
              value="auth login signin register"
              onSelect={() => handleSelect(() => navigate({ to: "/auth" }))}
            >
              <User className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>Sign in to GitBowl</span>
            </CommandItem>
          )}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Theme & Actions">
          <CommandItem
            value="theme dark mode"
            onSelect={() => handleSelect(() => toggleTheme("dark"))}
          >
            <Moon className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Switch to Dark Theme</span>
          </CommandItem>
          <CommandItem
            value="theme light mode"
            onSelect={() => handleSelect(() => toggleTheme("light"))}
          >
            <Sun className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Switch to Light Theme</span>
          </CommandItem>
          <CommandItem
            value="theme system auto"
            onSelect={() => handleSelect(() => toggleTheme("system"))}
          >
            <Laptop className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Use System Theme</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
