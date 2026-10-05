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
  ShieldCheck,
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
import { Label } from "@/components/ui/label";
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

  // Enterprise Organizations
  const [userOrgs, setUserOrgs] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);

  // Live Notifications
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [recentNotifs, setRecentNotifs] = useState<any[]>([]);

  useEffect(() => {
    async function loadNotifications() {
      if (!user) return;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) return;
        const res = await fetch("/api/notifications/", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          setUnreadNotifCount(json.unreadCount || 0);
          setRecentNotifs((json.notifications || []).slice(0, 5));
        }
      } catch (err) {
        console.warn("Failed to load notifications:", err);
      }
    }
    loadNotifications();
  }, [user]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("gitbowl_user_status");
      if (saved) setCurrentStatus(saved);
    }
  }, []);

  useEffect(() => {
    async function loadUserOrgs() {
      if (!user) return;
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.access_token) return;
      try {
        const res = await fetch("/api/orgs/", {
          headers: {
            Authorization: `Bearer ${sessionData.session.access_token}`,
          },
        });
        if (res.ok) {
          const json = await res.json();
          setUserOrgs(json.orgs || []);
        }
      } catch (err) {
        console.warn("Failed to load user orgs:", err);
      }
    }
    loadUserOrgs();
  }, [user]);

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setCreatingOrg(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch("/api/orgs/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
        },
        body: JSON.stringify({
          name: newOrgName.trim(),
          slug: newOrgSlug.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Failed to create organization");

      toast.success(`Created organization ${json.org.name}`);
      setCreateOrgOpen(false);
      setNewOrgName("");
      setNewOrgSlug("");
      setUserOrgs((prev) => [...prev, json.org]);
      navigate({ to: "/$owner", params: { owner: json.org.slug } });
    } catch (err: any) {
      toast.error(err.message || "Failed to create organization");
    } finally {
      setCreatingOrg(false);
    }
  }

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
  const displayName = profile?.display_name || user?.user_metadata?.["full_name"] || displayHandle;

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

                {/* NOTIFICATIONS DROPDOWN */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="relative h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors focus:outline-none"
                      title="Notifications"
                      aria-label="Notifications"
                    >
                      <Bell className="h-4 w-4" />
                      {unreadNotifCount > 0 && (
                        <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                        </span>
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-80 p-2 shadow-xl">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/80 px-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-foreground">Notifications</span>
                        {unreadNotifCount > 0 && (
                          <span className="text-[10px] bg-primary/15 text-primary font-semibold px-1.5 py-0.5 rounded-full">
                            {unreadNotifCount} unread
                          </span>
                        )}
                      </div>
                      <Link
                        to="/notifications"
                        className="text-[11px] text-primary hover:underline font-medium"
                      >
                        Inbox
                      </Link>
                    </div>

                    {recentNotifs.length === 0 ? (
                      <div className="py-6 text-center text-xs text-muted-foreground">
                        <Bell className="h-6 w-6 mx-auto mb-2 text-muted-foreground/40" />
                        No notifications yet
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {recentNotifs.map((n) => (
                          <DropdownMenuItem
                            key={n.id}
                            asChild
                            className="p-2 cursor-pointer rounded-md hover:bg-muted/60"
                          >
                            <Link
                              to={n.link || "/notifications"}
                              className="flex flex-col items-start gap-1 w-full"
                            >
                              <div className="flex items-center justify-between w-full">
                                <span
                                  className={`text-xs ${n.is_read ? "text-foreground/80 font-normal" : "text-foreground font-semibold"}`}
                                >
                                  {n.title}
                                </span>
                                {!n.is_read && (
                                  <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                                )}
                              </div>
                              {n.content && (
                                <span className="text-[11px] text-muted-foreground line-clamp-1 text-left">
                                  {n.content}
                                </span>
                              )}
                            </Link>
                          </DropdownMenuItem>
                        ))}
                      </div>
                    )}

                    <DropdownMenuSeparator className="my-1.5" />
                    <DropdownMenuItem
                      asChild
                      className="justify-center text-center text-xs font-medium text-primary cursor-pointer"
                    >
                      <Link to="/notifications">View all notifications</Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

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

                    <DropdownMenuSeparator className="my-1.5" />

                    <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                      <span>Your organizations</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setCreateOrgOpen(true);
                        }}
                        className="text-primary hover:underline text-[10px] lowercase font-normal flex items-center gap-0.5"
                      >
                        <Plus className="h-3 w-3" /> new
                      </button>
                    </div>

                    {userOrgs.map((o) => (
                      <DropdownMenuItem key={o.id} asChild>
                        <Link
                          to="/$owner"
                          params={{ owner: o.slug }}
                          className="gap-2.5 text-xs cursor-pointer"
                        >
                          <Building2 className="h-4 w-4 text-primary" />
                          <span className="truncate">{o.name}</span>
                          <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                            @{o.slug}
                          </span>
                        </Link>
                      </DropdownMenuItem>
                    ))}

                    {userOrgs.length === 0 && (
                      <DropdownMenuItem
                        onClick={() => setCreateOrgOpen(true)}
                        className="gap-2.5 text-xs cursor-pointer text-muted-foreground"
                      >
                        <Plus className="h-4 w-4" /> Create organization
                      </DropdownMenuItem>
                    )}

                    <DropdownMenuSeparator className="my-1.5" />

                    {(profile?.role === "admin" ||
                      user?.email?.toLowerCase() === "ahmedzarir07@gmail.com" ||
                      user?.email?.toLowerCase().includes("ahmedzarir") ||
                      profile?.username === "ahmedzarir") && (
                      <DropdownMenuItem asChild>
                        <Link
                          to="/admin"
                          className="gap-2.5 text-xs cursor-pointer text-emerald-500 font-medium"
                        >
                          <ShieldCheck className="h-4 w-4 text-emerald-500" /> Admin Center
                        </Link>
                      </DropdownMenuItem>
                    )}

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

      <Dialog open={createOrgOpen} onOpenChange={setCreateOrgOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <span>Create an organization</span>
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateOrg} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Organization name</Label>
              <Input
                placeholder="e.g. Acme Corp"
                value={newOrgName}
                onChange={(e) => {
                  setNewOrgName(e.target.value);
                  if (!newOrgSlug) {
                    setNewOrgSlug(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9]/g, "-")
                        .replace(/-+/g, "-"),
                    );
                  }
                }}
                required
                className="text-xs h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Organization handle (@slug)</Label>
              <Input
                placeholder="e.g. acme-corp"
                value={newOrgSlug}
                onChange={(e) =>
                  setNewOrgSlug(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]/g, "")
                      .replace(/-+/g, "-"),
                  )
                }
                required
                className="text-xs h-9 font-mono"
              />
              <p className="text-[10px] text-muted-foreground">
                Your URL will be: gitbowl.dev/{newOrgSlug || "your-org"}
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreateOrgOpen(false)}
                className="text-xs h-8"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={creatingOrg || !newOrgName.trim()}
                className="text-xs h-8 font-semibold"
              >
                {creatingOrg ? "Creating..." : "Create organization"}
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
