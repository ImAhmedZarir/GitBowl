import { useState, useEffect, ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Plus,
  Bell,
  BookMarked,
  User as UserIcon,
  LogOut,
  Compass,
  GitPullRequest,
  CircleDot,
  Menu,
  Settings,
  Star,
  Keyboard,
  FilePlus,
  FolderGit2,
} from "lucide-react";
import { BowlLogo } from "@/components/BowlLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { GlobalSearch } from "@/components/GlobalSearch";
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

interface AppShellProps {
  children: ReactNode;
  hideFooter?: boolean;
}

export function AppShell({ children, hideFooter = false }: AppShellProps) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Global keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const activeEl = document.activeElement;
      const isInput =
        activeEl?.tagName === "INPUT" ||
        activeEl?.tagName === "TEXTAREA" ||
        activeEl?.getAttribute("contenteditable") === "true";

      // ⌘K or Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
        return;
      }

      // Single-key shortcuts only if not typing in an input
      if (!isInput) {
        if (e.key === "/") {
          e.preventDefault();
          setSearchOpen(true);
        } else if (e.key === "?") {
          e.preventDefault();
          setShortcutsOpen(true);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary">
      {/* Sticky Top Bar (56px) */}
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
                to="/explore"
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Pull requests
              </Link>
              <Link
                to="/explore"
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Issues
              </Link>
            </nav>
          </div>

          {/* Center section: Global Search Bar trigger (⌘K) */}
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

          {/* Right section: Actions + User Profile */}
          <div className="flex items-center gap-2">
            {/* Mobile search trigger */}
            <button
              type="button"
              aria-label="Open search"
              onClick={() => setSearchOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground sm:hidden"
            >
              <Search className="h-4 w-4" />
            </button>

            {/* Keyboard shortcuts trigger button */}
            <button
              type="button"
              aria-label="Keyboard shortcuts"
              onClick={() => setShortcutsOpen(true)}
              className="hidden lg:flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground"
              title="Keyboard shortcuts (?)"
            >
              <Keyboard className="h-4 w-4" />
            </button>

            {/* Theme Toggle */}
            <ThemeToggle />

            {user ? (
              <>
                {/* Notification Bell */}
                <button
                  type="button"
                  aria-label="Notifications"
                  className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Bell className="h-4 w-4" />
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary" />
                </button>

                {/* + New Dropdown */}
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

                {/* User Avatar Menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="User menu"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 border border-primary/30 text-xs font-semibold text-primary transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

            {/* Mobile hamburger */}
            <button
              type="button"
              aria-label="Open mobile menu"
              onClick={() => setMobileMenuOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-72 p-6">
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-2">
              <BowlLogo className="h-5 w-5 text-primary" />
              <span>GitBowl</span>
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6 flex flex-col gap-2">
            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              Home
            </Link>
            <Link
              to="/explore"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              Explore Repositories
            </Link>
            {user ? (
              <>
                <Link
                  to="/new"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" /> New repository
                </Link>
                {profile && (
                  <Link
                    to="/$owner"
                    params={{ owner: profile.username }}
                    onClick={() => setMobileMenuOpen(false)}
                    className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent flex items-center gap-2"
                  >
                    <UserIcon className="h-4 w-4" /> Your Profile
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    signOut();
                  }}
                  className="mt-4 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 text-left"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </>
            ) : (
              <div className="mt-4 flex flex-col gap-2">
                <Button asChild size="sm">
                  <Link to="/auth" onClick={() => setMobileMenuOpen(false)}>
                    Sign in / Sign up
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Global Modals */}
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <KeyboardShortcutsModal open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      {/* Page Content */}
      <main className="flex-1">{children}</main>

      {/* Global Footer */}
      {!hideFooter && <Footer />}
    </div>
  );
}
