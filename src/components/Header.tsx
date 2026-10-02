import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookMarked,
  LogOut,
  Plus,
  Search,
  User as UserIcon,
  Bell,
  Star,
  Keyboard,
  FolderGit2,
  FilePlus,
  Settings as SettingsIcon,
  Key,
  HardDrive,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BowlLogo } from "@/components/BowlLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { GlobalSearch } from "@/components/GlobalSearch";
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";
import { firebaseAuth, fbSignOut } from "@/lib/firebase";

export function Header() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await fbSignOut(firebaseAuth).catch(() => {});
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <>
      <header className="sticky top-0 z-40 h-14 border-b border-border bg-background/85 backdrop-blur-md transition-colors">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-3 px-4">
          {/* Left section: Logo + Primary Navigation */}
          <div className="flex items-center gap-5">
            <Link
              to="/"
              className="flex items-center gap-2 font-semibold tracking-tight transition-opacity hover:opacity-90"
            >
              <BowlLogo className="h-6 w-6 text-primary" />
              <span className="text-base font-bold bg-gradient-to-r from-primary to-success bg-clip-text text-transparent">
                GitBowl
              </span>
            </Link>

            <nav className="hidden items-center gap-1 md:flex" aria-label="Global navigation">
              <Link
                to="/explore"
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                activeProps={{ className: "text-foreground bg-accent font-semibold" }}
              >
                Explore
              </Link>
              <Link
                to="/pulls"
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                activeProps={{ className: "text-foreground bg-accent font-semibold" }}
              >
                Pull requests
              </Link>
              <Link
                to="/issues"
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                activeProps={{ className: "text-foreground bg-accent font-semibold" }}
              >
                Issues
              </Link>
            </nav>
          </div>

          {/* Center search trigger */}
          <div className="flex-1 max-w-md mx-2 hidden sm:block">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex h-9 w-full items-center justify-between rounded-lg border border-border/80 bg-muted/40 px-3 text-xs text-muted-foreground transition-all hover:border-border hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <div className="flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate">Type / to search or jump to...</span>
              </div>
              <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border border-border/80 bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                ⌘K
              </kbd>
            </button>
          </div>

          {/* Right section */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Open search"
              onClick={() => setSearchOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground sm:hidden"
            >
              <Search className="h-4 w-4" />
            </button>

            <button
              type="button"
              aria-label="Keyboard shortcuts"
              onClick={() => setShortcutsOpen(true)}
              className="hidden lg:flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground"
              title="Keyboard shortcuts (?)"
            >
              <Keyboard className="h-4 w-4" />
            </button>

            <ThemeToggle />

            {user ? (
              <>
                <button
                  type="button"
                  aria-label="Notifications"
                  className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Bell className="h-4 w-4" />
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary" />
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" className="h-8 gap-1.5 px-2.5 text-xs">
                      <Plus className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">New</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem asChild>
                      <Link to="/new" className="gap-2 text-xs">
                        <FolderGit2 className="h-3.5 w-3.5 text-primary" /> New repository
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/new" className="gap-2 text-xs">
                        <FilePlus className="h-3.5 w-3.5" /> Import repository
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="User menu"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 border border-primary/30 text-xs font-semibold text-primary transition-transform hover:scale-105"
                    >
                      {(profile?.username || user.email || "?").slice(0, 2).toUpperCase()}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <div className="px-3 py-2">
                      <p className="text-xs font-semibold text-foreground">
                        {profile?.display_name || profile?.username || "Developer"}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        @{profile?.username || user.email}
                      </p>
                    </div>
                    <DropdownMenuSeparator />
                    {profile && (
                      <>
                        <DropdownMenuItem asChild>
                          <Link
                            to="/$owner"
                            params={{ owner: profile.username }}
                            className="gap-2 text-xs"
                          >
                            <UserIcon className="h-3.5 w-3.5" /> Your profile
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link
                            to="/$owner"
                            params={{ owner: profile.username }}
                            className="gap-2 text-xs"
                          >
                            <BookMarked className="h-3.5 w-3.5" /> Your repositories
                          </Link>
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuItem asChild>
                      <Link to="/explore" className="gap-2 text-xs">
                        <Star className="h-3.5 w-3.5" /> Starred repositories
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/settings" search={{ tab: "profile" }} className="gap-2 text-xs">
                        <SettingsIcon className="h-3.5 w-3.5" /> Settings
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/settings" search={{ tab: "tokens" }} className="gap-2 text-xs">
                        <Key className="h-3.5 w-3.5" /> Access Tokens (PAT)
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/settings" search={{ tab: "storage" }} className="gap-2 text-xs">
                        <HardDrive className="h-3.5 w-3.5" /> Cloud Storage
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={signOut} className="gap-2 text-xs text-destructive">
                      <LogOut className="h-3.5 w-3.5" /> Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
                  <Link to="/auth">Sign in</Link>
                </Button>
                <Button asChild size="sm" className="h-8 text-xs font-medium">
                  <Link to="/auth">Sign up</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <KeyboardShortcutsModal open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  );
}
