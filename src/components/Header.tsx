import { useState, useEffect } from "react";
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
  Smile,
  ArrowLeftRight,
  Code2,
  Building2,
  Globe,
  Heart,
  Bot,
  FlaskConical,
  Palette,
  Accessibility,
  Menu,
  GitPullRequest,
  CircleDot,
  Check,
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BowlLogo } from "@/components/BowlLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { GlobalSearch } from "@/components/GlobalSearch";
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";
import { firebaseAuth, fbSignOut } from "@/lib/firebase";
import { toast } from "sonner";

export function Header() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [currentStatus, setCurrentStatus] = useState("Focusing on code 🚀");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("gitbowl_user_status");
      if (saved) setCurrentStatus(saved);
    }
  }, []);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await fbSignOut(firebaseAuth).catch(() => {});
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  function handleSaveStatus(e: React.FormEvent) {
    e.preventDefault();
    if (!statusText.trim()) return;
    setCurrentStatus(statusText.trim());
    if (typeof window !== "undefined") {
      localStorage.setItem("gitbowl_user_status", statusText.trim());
    }
    setStatusDialogOpen(false);
    toast.success("Status updated!");
  }

  const userAvatar =
    (profile as any)?.avatar_url ||
    (user as any)?.user_metadata?.avatar_url ||
    (user as any)?.photoURL ||
    null;

  const displayHandle = profile?.username || user?.email?.split("@")[0] || "developer";
  const displayName = profile?.display_name || user?.user_metadata?.full_name || displayHandle;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          {/* LEFT: Logo & Breadcrumb / Nav */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground md:hidden"
              onClick={() => setSearchOpen(true)}
            >
              <Menu className="h-4 w-4" />
            </Button>

            <Link
              to="/"
              className="flex items-center gap-2.5 font-bold tracking-tight text-foreground transition-opacity hover:opacity-90"
            >
              <BowlLogo className="h-6 w-6 text-primary" />
              <span className="text-base font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
                GitBowl
              </span>
            </Link>

            {profile && (
              <span className="hidden sm:inline-flex items-center text-xs text-muted-foreground font-mono">
                /
                <Link
                  to="/$owner"
                  params={{ owner: profile.username }}
                  className="ml-1 text-foreground hover:underline font-semibold"
                >
                  {profile.username}
                </Link>
              </span>
            )}
          </div>

          {/* CENTER: GitHub-Style Search Bar */}
          <div className="flex-1 max-w-md mx-4 hidden md:block">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="w-full flex items-center justify-between rounded-md border border-border/80 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground hover:border-border hover:bg-muted/70 transition-all shadow-2xs"
            >
              <div className="flex items-center gap-2">
                <Search className="h-3.5 w-3.5" />
                <span>Type / to search repositories, issues, users...</span>
              </div>
              <kbd className="pointer-events-none inline-flex h-4 items-center rounded border border-border bg-background px-1 text-[10px] font-mono text-muted-foreground">
                /
              </kbd>
            </button>
          </div>

          {/* RIGHT: Actions & User Avatar */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground md:hidden"
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
            >
              <Search className="h-4 w-4" />
            </Button>

            {user ? (
              <>
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground hidden sm:inline-flex"
                  title="Pull requests"
                >
                  <Link to="/pulls">
                    <GitPullRequest className="h-4 w-4" />
                  </Link>
                </Button>

                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground hidden sm:inline-flex"
                  title="Issues"
                >
                  <Link to="/issues">
                    <CircleDot className="h-4 w-4" />
                  </Link>
                </Button>

                {/* + Create Menu Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      aria-label="Create new"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 text-xs">
                    <DropdownMenuItem asChild>
                      <Link to="/new" search={{ tab: "create" }} className="gap-2">
                        <FolderGit2 className="h-3.5 w-3.5 text-primary" /> New repository
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/new" search={{ tab: "import" }} className="gap-2">
                        <FilePlus className="h-3.5 w-3.5 text-primary" /> Import repository
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/settings" search={{ tab: "tokens" }} className="gap-2">
                        <Key className="h-3.5 w-3.5" /> New access token
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground hidden sm:inline-flex"
                  title="Notifications"
                >
                  <Bell className="h-4 w-4" />
                </Button>

                {/* USER AVATAR DROPDOWN - EXACT REPLICA OF GITHUB (Image 1) */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="User navigation menu"
                      className="relative flex h-8 w-8 items-center justify-center rounded-full border border-border/80 overflow-hidden ring-offset-background transition-all hover:ring-2 hover:ring-primary/40 focus:outline-none"
                    >
                      {userAvatar ? (
                        <img
                          src={userAvatar}
                          alt={displayHandle}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                          {displayHandle.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent align="end" className="w-64 p-1.5 shadow-xl">
                    {/* Top Identity Card */}
                    <div className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-9 w-9 rounded-full overflow-hidden border border-border/80 shrink-0">
                          {userAvatar ? (
                            <img src={userAvatar} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                              {displayHandle.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-foreground truncate">
                            {displayHandle}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {displayName}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate({ to: "/auth" })}
                        title="Switch account"
                        className="h-7 w-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
                      >
                        <ArrowLeftRight className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Set Status Button */}
                    <button
                      type="button"
                      onClick={() => setStatusDialogOpen(true)}
                      className="w-full mt-1 flex items-center gap-2 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-colors text-left"
                    >
                      <Smile className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{currentStatus || "Set status"}</span>
                    </button>

                    <DropdownMenuSeparator className="my-1.5" />

                    {/* Navigation Items (GitHub Image 1) */}
                    <DropdownMenuItem asChild>
                      <Link
                        to="/$owner"
                        params={{ owner: displayHandle }}
                        className="gap-2.5 text-xs cursor-pointer"
                      >
                        <UserIcon className="h-4 w-4 text-muted-foreground" /> Your profile
                      </Link>
                    </DropdownMenuItem>

                    <DropdownMenuItem asChild>
                      <Link
                        to="/$owner"
                        params={{ owner: displayHandle }}
                        search={{ tab: "repositories" }}
                        className="gap-2.5 text-xs cursor-pointer"
                      >
                        <BookMarked className="h-4 w-4 text-muted-foreground" /> Your repositories
                      </Link>
                    </DropdownMenuItem>

                    <DropdownMenuItem asChild>
                      <Link
                        to="/$owner"
                        params={{ owner: displayHandle }}
                        search={{ tab: "stars" }}
                        className="gap-2.5 text-xs cursor-pointer"
                      >
                        <Star className="h-4 w-4 text-muted-foreground" /> Your stars
                      </Link>
                    </DropdownMenuItem>

                    <DropdownMenuItem asChild>
                      <Link to="/explore" className="gap-2.5 text-xs cursor-pointer">
                        <Code2 className="h-4 w-4 text-muted-foreground" /> Explore & Gists
                      </Link>
                    </DropdownMenuItem>

                    <DropdownMenuItem asChild>
                      <Link to="/settings" className="gap-2.5 text-xs cursor-pointer">
                        <Building2 className="h-4 w-4 text-muted-foreground" /> Organizations
                      </Link>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator className="my-1.5" />

                    {/* Settings Section (GitHub Image 1) */}
                    <DropdownMenuItem asChild>
                      <Link
                        to="/settings"
                        search={{ tab: "profile" }}
                        className="gap-2.5 text-xs cursor-pointer"
                      >
                        <SettingsIcon className="h-4 w-4 text-muted-foreground" /> Settings
                      </Link>
                    </DropdownMenuItem>

                    <DropdownMenuItem asChild>
                      <Link
                        to="/settings"
                        search={{ tab: "tokens" }}
                        className="gap-2.5 text-xs cursor-pointer"
                      >
                        <Key className="h-4 w-4 text-muted-foreground" /> Access Tokens (PAT)
                      </Link>
                    </DropdownMenuItem>

                    <DropdownMenuItem asChild>
                      <Link
                        to="/settings"
                        search={{ tab: "git" }}
                        className="gap-2.5 text-xs cursor-pointer"
                      >
                        <Bot className="h-4 w-4 text-muted-foreground" /> Git CLI & Setup
                      </Link>
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={() => setShortcutsOpen(true)}
                      className="gap-2.5 text-xs cursor-pointer justify-between"
                    >
                      <div className="flex items-center gap-2.5">
                        <FlaskConical className="h-4 w-4 text-muted-foreground" /> Feature preview
                      </div>
                      <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-primary/20 text-primary">
                        New
                      </span>
                    </DropdownMenuItem>

                    <div className="flex items-center justify-between px-2 py-1.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2.5">
                        <Palette className="h-4 w-4" /> Appearance
                      </div>
                      <ThemeToggle />
                    </div>

                    <DropdownMenuSeparator className="my-1.5" />

                    <DropdownMenuItem
                      onClick={signOut}
                      className="gap-2.5 text-xs text-destructive hover:bg-destructive/10 focus:text-destructive cursor-pointer"
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
                  <Link
                    to="/auth"
                    search={{
                      redirect: typeof window !== "undefined" ? window.location.pathname : "/",
                    }}
                  >
                    Sign in
                  </Link>
                </Button>
                <Button asChild size="sm" className="h-8 text-xs font-medium">
                  <Link
                    to="/auth"
                    search={{
                      redirect: typeof window !== "undefined" ? window.location.pathname : "/",
                    }}
                  >
                    Sign up
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Set Status Modal */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Smile className="h-4 w-4 text-primary" /> Edit status
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveStatus} className="space-y-3 pt-2">
            <Input
              value={statusText}
              onChange={(e) => setStatusText(e.target.value)}
              placeholder="What's happening? e.g. Building with GitBowl"
              className="text-xs h-9"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStatusDialogOpen(false)}
                className="text-xs h-8"
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" className="text-xs h-8 font-semibold">
                Set status
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <KeyboardShortcutsModal open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  );
}
