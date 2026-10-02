import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  User,
  Key,
  Shield,
  HardDrive,
  Terminal,
  Copy,
  Check,
  Trash2,
  Plus,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Lock,
  Globe,
  Github,
  Building,
  MapPin,
  Info,
} from "lucide-react";

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as string) || "profile",
  }),
  component: SettingsPage,
});

type TokenItem = {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
};

function SettingsPage() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const currentTab = search.tab || "profile";

  // Profile Form States
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Username validation
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  // Tokens Tab States
  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [newTokenName, setNewTokenName] = useState("");
  const [newTokenDays, setNewTokenDays] = useState("30");
  const [newTokenScopes, setNewTokenScopes] = useState<string[]>(["repo"]);
  const [creatingToken, setCreatingToken] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedCli, setCopiedCli] = useState(false);

  // Storage Health State
  const [storageHealth, setStorageHealth] = useState<{
    ok: boolean;
    folderName?: string;
    folderId?: string;
    serviceAccount?: string;
    error?: string;
    checking?: boolean;
  } | null>(null);

  // Password Change State
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // Sync profile data to form
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || "");
      setUsername(profile.username || "");
      setBio(profile.bio || "");
    }
  }, [profile]);

  // Redirect if unauthenticated
  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/auth", search: { redirect: "/settings" } });
    }
  }, [user, loading, navigate]);

  // Load Tokens when on tokens tab
  useEffect(() => {
    if (currentTab === "tokens" && user) {
      loadTokens();
    }
    if (currentTab === "storage") {
      checkStorage();
    }
  }, [currentTab, user]);

  // Check username uniqueness
  useEffect(() => {
    const clean = username.trim().toLowerCase();
    if (!clean || clean === profile?.username) {
      setUsernameAvailable(null);
      setUsernameError(null);
      setUsernameChecking(false);
      return;
    }

    if (clean.length < 3) {
      setUsernameAvailable(false);
      setUsernameError("Username must be at least 3 characters");
      return;
    }

    if (!/^[a-z0-9]([a-z0-9-]{1,37}[a-z0-9])?$/.test(clean)) {
      setUsernameAvailable(false);
      setUsernameError("Letters, numbers, and single hyphens only");
      return;
    }

    setUsernameChecking(true);
    setUsernameError(null);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/auth/check-username?username=${encodeURIComponent(clean)}&excludeUserId=${user?.id || ""}`,
        );
        const data = await res.json();
        setUsernameAvailable(data.available);
        if (!data.available) {
          setUsernameError(data.reason || "Username is already taken");
        } else {
          setUsernameError(null);
        }
      } catch {
        setUsernameAvailable(null);
      } finally {
        setUsernameChecking(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [username, profile?.username, user?.id]);

  async function loadTokens() {
    setTokensLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/auth/tokens", {
        headers: {
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
      });
      const data = await res.json();
      setTokens(data.tokens || []);
    } catch {
      toast.error("Failed to load access tokens");
    } finally {
      setTokensLoading(false);
    }
  }

  async function checkStorage() {
    setStorageHealth({ ok: false, checking: true });
    try {
      const res = await fetch("/api/storage/health");
      const data = await res.json();
      setStorageHealth({ ...data, checking: false });
    } catch (e: any) {
      setStorageHealth({
        ok: false,
        error: e.message || "Failed to reach storage health endpoint",
        checking: false,
      });
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (usernameError) {
      toast.error(usernameError);
      return;
    }

    setSavingProfile(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch("/api/auth/update-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({
          displayName,
          username: username.trim().toLowerCase(),
          bio,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to update profile");
      }

      toast.success("Profile updated successfully!");
      // Reload page to refresh auth state
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || "Error updating profile");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleCreateToken(e: React.FormEvent) {
    e.preventDefault();
    if (!newTokenName.trim()) {
      toast.error("Please enter a token name");
      return;
    }

    setCreatingToken(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch("/api/auth/tokens", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({
          name: newTokenName.trim(),
          expires_in_days: Number(newTokenDays),
          scopes: newTokenScopes,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to generate token");
      }

      setGeneratedToken(data.token);
      setNewTokenName("");
      loadTokens();
      toast.success("Personal access token generated!");
    } catch (err: any) {
      toast.error(err.message || "Failed to create token");
    } finally {
      setCreatingToken(false);
    }
  }

  async function handleDeleteToken(id: string) {
    if (
      !confirm(
        "Are you sure you want to revoke this access token? Git operations using it will fail.",
      )
    ) {
      return;
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch(`/api/auth/tokens?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
      });

      if (!res.ok) throw new Error("Failed to revoke token");
      toast.success("Token revoked successfully");
      loadTokens();
    } catch (err: any) {
      toast.error(err.message || "Could not delete token");
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password updated successfully!");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err.message || "Failed to change password");
    } finally {
      setChangingPassword(false);
    }
  }

  function copyToClipboard(text: string, type: "token" | "cli") {
    navigator.clipboard.writeText(text);
    if (type === "token") {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2500);
      toast.success("Token copied to clipboard!");
    } else {
      setCopiedCli(true);
      setTimeout(() => setCopiedCli(false), 2500);
      toast.success("Command copied!");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
        <Footer />
      </div>
    );
  }

  if (!user) return null;

  const currentUsername = profile?.username || "developer";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="flex-1 container max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">User Settings</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage your developer profile, personal access tokens, Git configuration, and cloud
            storage.
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-8">
          {/* Navigation Sidebar */}
          <aside className="w-full md:w-56 shrink-0 space-y-1">
            <button
              type="button"
              onClick={() => navigate({ to: "/settings", search: { tab: "profile" } })}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg text-left transition-colors ${
                currentTab === "profile"
                  ? "bg-accent text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              <User className="h-4 w-4 text-primary" />
              Public Profile
            </button>

            <button
              type="button"
              onClick={() => navigate({ to: "/settings", search: { tab: "tokens" } })}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg text-left transition-colors ${
                currentTab === "tokens"
                  ? "bg-accent text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              <Key className="h-4 w-4 text-primary" />
              Access Tokens (PAT)
            </button>

            <button
              type="button"
              onClick={() => navigate({ to: "/settings", search: { tab: "storage" } })}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg text-left transition-colors ${
                currentTab === "storage"
                  ? "bg-accent text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              <HardDrive className="h-4 w-4 text-primary" />
              Cloud Storage
            </button>

            <button
              type="button"
              onClick={() => navigate({ to: "/settings", search: { tab: "git" } })}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg text-left transition-colors ${
                currentTab === "git"
                  ? "bg-accent text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              <Terminal className="h-4 w-4 text-primary" />
              Git CLI Setup
            </button>

            <button
              type="button"
              onClick={() => navigate({ to: "/settings", search: { tab: "account" } })}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg text-left transition-colors ${
                currentTab === "account"
                  ? "bg-accent text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              <Shield className="h-4 w-4 text-primary" />
              Account & Security
            </button>
          </aside>

          {/* Main Tab Content */}
          <div className="flex-1 min-w-0">
            {/* TAB 1: PUBLIC PROFILE */}
            {currentTab === "profile" && (
              <div className="space-y-6">
                <div className="border border-border rounded-xl bg-card p-6 shadow-xs">
                  <div className="flex items-center gap-4 pb-6 border-b border-border">
                    <div className="h-16 w-16 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-lg font-bold text-primary">
                      {currentUsername.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">
                        {profile?.display_name || currentUsername}
                      </h2>
                      <p className="text-xs text-muted-foreground">@{currentUsername}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Signed in as <span className="font-mono text-foreground">{user.email}</span>
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleSaveProfile} className="mt-6 space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="display_name" className="text-xs font-medium">
                        Display Name
                      </Label>
                      <Input
                        id="display_name"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Your full name"
                        className="text-xs h-9"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label
                        htmlFor="username"
                        className="text-xs font-medium flex items-center justify-between"
                      >
                        <span>Username / Handle</span>
                        {usernameChecking && (
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <RefreshCw className="h-3 w-3 animate-spin" /> Checking availability...
                          </span>
                        )}
                        {!usernameChecking && usernameAvailable === true && (
                          <span className="text-[11px] text-success flex items-center gap-1">
                            <Check className="h-3 w-3" /> Available
                          </span>
                        )}
                        {!usernameChecking && usernameAvailable === false && (
                          <span className="text-[11px] text-destructive flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> {usernameError || "Unavailable"}
                          </span>
                        )}
                      </Label>
                      <div className="flex rounded-md shadow-xs">
                        <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted/60 text-muted-foreground text-xs font-mono">
                          gitbowl.zone.id/
                        </span>
                        <Input
                          id="username"
                          value={username}
                          onChange={(e) =>
                            setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                          }
                          placeholder="username"
                          className="rounded-l-none text-xs h-9 font-mono"
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Changing your username will change your profile URL and git clone paths.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="bio" className="text-xs font-medium flex justify-between">
                        <span>Bio</span>
                        <span className="text-[11px] text-muted-foreground">{bio.length}/250</span>
                      </Label>
                      <Textarea
                        id="bio"
                        value={bio}
                        onChange={(e) => setBio(e.target.value.slice(0, 250))}
                        placeholder="Tell the developer community a little bit about yourself"
                        rows={3}
                        className="text-xs resize-none"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="location"
                          className="text-xs font-medium flex items-center gap-1.5"
                        >
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground" /> Location
                        </Label>
                        <Input
                          id="location"
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          placeholder="e.g. San Francisco, CA"
                          className="text-xs h-9"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label
                          htmlFor="website"
                          className="text-xs font-medium flex items-center gap-1.5"
                        >
                          <Globe className="h-3.5 w-3.5 text-muted-foreground" /> Website /
                          Portfolio
                        </Label>
                        <Input
                          id="website"
                          value={website}
                          onChange={(e) => setWebsite(e.target.value)}
                          placeholder="https://yourportfolio.dev"
                          className="text-xs h-9"
                        />
                      </div>
                    </div>

                    <div className="pt-4 flex justify-end">
                      <Button
                        type="submit"
                        disabled={savingProfile || !!usernameError}
                        className="text-xs font-semibold h-9 px-5"
                      >
                        {savingProfile ? "Saving..." : "Save profile changes"}
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* TAB 2: PERSONAL ACCESS TOKENS */}
            {currentTab === "tokens" && (
              <div className="space-y-6">
                {/* Generated Token Alert */}
                {generatedToken && (
                  <div className="border border-success/30 bg-success/10 rounded-xl p-5 space-y-3">
                    <div className="flex items-center gap-2 text-success font-semibold text-xs">
                      <Check className="h-4 w-4" />
                      <span>New Personal Access Token Generated!</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Make sure to copy your personal access token now. You will not be able to see
                      it again!
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 font-mono text-xs bg-background/80 border border-success/40 rounded-lg px-3 py-2 text-foreground select-all break-all">
                        {generatedToken}
                      </div>
                      <Button
                        size="sm"
                        onClick={() => copyToClipboard(generatedToken, "token")}
                        className="h-9 px-3 gap-1.5 text-xs font-semibold"
                      >
                        {copiedToken ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {copiedToken ? "Copied" : "Copy"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Generate Token Card */}
                <div className="border border-border rounded-xl bg-card p-6 shadow-xs space-y-5">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      Generate New Access Token
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Personal access tokens function like OAuth access tokens and are used to
                      authenticate Git operations (clone, fetch, push) over HTTPS.
                    </p>
                  </div>

                  <form onSubmit={handleCreateToken} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="token_name" className="text-xs font-medium">
                        Token Description / Note
                      </Label>
                      <Input
                        id="token_name"
                        value={newTokenName}
                        onChange={(e) => setNewTokenName(e.target.value)}
                        placeholder="e.g. My MacBook Pro CLI, VSCode Git, CI/CD Runner"
                        className="text-xs h-9"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="token_days" className="text-xs font-medium">
                          Expiration
                        </Label>
                        <select
                          id="token_days"
                          value={newTokenDays}
                          onChange={(e) => setNewTokenDays(e.target.value)}
                          className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground shadow-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="30">30 days</option>
                          <option value="60">60 days</option>
                          <option value="90">90 days</option>
                          <option value="365">1 year</option>
                          <option value="0">No expiration</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Scopes</Label>
                        <div className="flex items-center gap-2 pt-1.5">
                          <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
                            <input
                              type="checkbox"
                              checked={newTokenScopes.includes("repo")}
                              onChange={(e) => {
                                if (e.target.checked)
                                  setNewTokenScopes([...newTokenScopes, "repo"]);
                                else setNewTokenScopes(newTokenScopes.filter((s) => s !== "repo"));
                              }}
                              className="rounded border-border text-primary focus:ring-primary"
                            />
                            <span className="font-mono text-xs font-semibold">repo</span>
                            <span className="text-[11px] text-muted-foreground">
                              (Full repository control)
                            </span>
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <Button
                        type="submit"
                        disabled={creatingToken || !newTokenName.trim()}
                        className="text-xs font-semibold h-9 px-4 gap-1.5"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {creatingToken ? "Generating..." : "Generate token"}
                      </Button>
                    </div>
                  </form>
                </div>

                {/* Active Tokens List */}
                <div className="border border-border rounded-xl bg-card p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">
                        Active Access Tokens
                      </h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Tokens you have generated that can access your Git repositories.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={loadTokens}
                      disabled={tokensLoading}
                      className="h-8 text-xs gap-1.5"
                    >
                      <RefreshCw className={`h-3 w-3 ${tokensLoading ? "animate-spin" : ""}`} />
                      Refresh
                    </Button>
                  </div>

                  {tokensLoading ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      Loading your tokens...
                    </div>
                  ) : tokens.length === 0 ? (
                    <div className="py-8 text-center border border-dashed border-border rounded-lg p-6 space-y-2">
                      <Key className="h-6 w-6 text-muted-foreground mx-auto" />
                      <p className="text-xs font-medium text-foreground">
                        No personal access tokens
                      </p>
                      <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                        Generate a token above to authenticate Git CLI commands like{" "}
                        <code className="text-primary">git clone</code> and{" "}
                        <code className="text-primary">git push</code>.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {tokens.map((t) => (
                        <div key={t.id} className="py-3 flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-foreground truncate">
                                {t.name}
                              </span>
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                {t.token_prefix}...
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
                              <span>Created {new Date(t.created_at).toLocaleDateString()}</span>
                              <span>•</span>
                              <span>
                                {t.expires_at
                                  ? `Expires ${new Date(t.expires_at).toLocaleDateString()}`
                                  : "Never expires"}
                              </span>
                              <span>•</span>
                              <span className="text-primary font-mono">
                                {t.scopes?.join(", ") || "repo"}
                              </span>
                            </div>
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteToken(t.id)}
                            className="h-8 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive text-xs gap-1"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Revoke
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Git CLI Helper */}
                <div className="border border-border/80 rounded-xl bg-muted/30 p-5 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <Terminal className="h-4 w-4 text-primary" />
                    <span>How to use your Personal Access Token in Git CLI</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    When pushing or cloning via HTTPS, Git will prompt for your username and
                    password:
                  </p>
                  <div className="bg-background rounded-lg border border-border p-3 font-mono text-[11px] text-foreground space-y-1">
                    <p className="text-muted-foreground"># Example git clone:</p>
                    <p className="text-primary">
                      git clone https://gitbowl.zone.id/api/public/git/{currentUsername}/my-repo.git
                    </p>
                    <p className="text-muted-foreground mt-2"># When prompted by Git:</p>
                    <p>
                      Username for &apos;https://gitbowl.zone.id&apos;:{" "}
                      <strong className="text-foreground">{currentUsername}</strong>
                    </p>
                    <p>
                      Password for &apos;https://gitbowl.zone.id&apos;:{" "}
                      <strong className="text-foreground">
                        &lt;paste_your_personal_access_token&gt;
                      </strong>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: CLOUD STORAGE */}
            {currentTab === "storage" && (
              <div className="space-y-6">
                <div className="border border-border rounded-xl bg-card p-6 shadow-xs space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">
                        Central File Storage Engine
                      </h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        GitBowl uses centralized object storage to store Git blobs, binary objects,
                        and repository archives.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={checkStorage}
                      disabled={storageHealth?.checking}
                      className="h-8 text-xs gap-1.5"
                    >
                      <RefreshCw
                        className={`h-3 w-3 ${storageHealth?.checking ? "animate-spin" : ""}`}
                      />
                      Check Health
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="border border-border rounded-lg p-4 bg-muted/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">
                          Storage Provider
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                          Google Drive
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Service Account Authentication (Server-to-Server)
                      </p>
                    </div>

                    <div className="border border-border rounded-lg p-4 bg-muted/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">Target Folder</span>
                        <span className="font-mono text-[11px] text-primary">
                          {storageHealth?.folderName || "GitBowl-Store"}
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-muted-foreground truncate">
                        ID: 1kmpvKOO6Naofeq5V2je1GBxVvHl6Gwos
                      </p>
                    </div>
                  </div>

                  {/* Service Account Details */}
                  <div className="border border-border rounded-lg p-4 space-y-3 bg-background">
                    <h3 className="text-xs font-semibold text-foreground">
                      Configured Service Account
                    </h3>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between py-1 border-b border-border/50">
                        <span className="text-muted-foreground">Client Email</span>
                        <span className="font-mono text-[11px] text-foreground">
                          gitbowl-store@gitbowl.iam.gserviceaccount.com
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-border/50">
                        <span className="text-muted-foreground">Target Shared Folder ID</span>
                        <span className="font-mono text-[11px] text-foreground">
                          1kmpvKOO6Naofeq5V2je1GBxVvHl6Gwos
                        </span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">Connection Status</span>
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                          <Check className="h-3.5 w-3.5" /> Authenticated & Connected
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Informational Notice */}
                  <div className="border border-primary/20 bg-primary/5 rounded-xl p-4 flex gap-3 text-xs">
                    <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">
                        Google Cloud Storage Architecture
                      </p>
                      <p className="text-muted-foreground text-[11px] leading-relaxed">
                        Your service account credentials are encrypted and stored exclusively in the
                        backend server. All Git clone, push, and file requests pass through
                        server-side proxy handlers with access token rotation, keeping private keys
                        secure.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: GIT CLI SETUP */}
            {currentTab === "git" && (
              <div className="space-y-6">
                <div className="border border-border rounded-xl bg-card p-6 shadow-xs space-y-5">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      Configure Git on your Machine
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Run these standard Git commands in your terminal to set your identity for
                      commits made to GitBowl.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">1. Global Git Identity</Label>
                      <div className="relative">
                        <pre className="bg-muted/50 border border-border rounded-lg p-3 font-mono text-xs text-foreground overflow-x-auto">
                          {`git config --global user.name "${profile?.display_name || currentUsername}"
git config --global user.email "${user.email}"`}
                        </pre>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            copyToClipboard(
                              `git config --global user.name "${profile?.display_name || currentUsername}"\ngit config --global user.email "${user.email}"`,
                              "cli",
                            )
                          }
                          className="absolute top-2 right-2 h-7 px-2 text-[11px]"
                        >
                          <Copy className="h-3 w-3 mr-1" /> Copy
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2">
                      <Label className="text-xs font-medium">
                        2. Push an Existing Local Repository to GitBowl
                      </Label>
                      <div className="relative">
                        <pre className="bg-muted/50 border border-border rounded-lg p-3 font-mono text-xs text-foreground overflow-x-auto">
                          {`git remote add origin https://gitbowl.zone.id/api/public/git/${currentUsername}/<your-repo-name>.git
git branch -M main
git push -u origin main`}
                        </pre>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            copyToClipboard(
                              `git remote add origin https://gitbowl.zone.id/api/public/git/${currentUsername}/<your-repo-name>.git\ngit branch -M main\ngit push -u origin main`,
                              "cli",
                            )
                          }
                          className="absolute top-2 right-2 h-7 px-2 text-[11px]"
                        >
                          <Copy className="h-3 w-3 mr-1" /> Copy
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: ACCOUNT & SECURITY */}
            {currentTab === "account" && (
              <div className="space-y-6">
                {/* Account Details */}
                <div className="border border-border rounded-xl bg-card p-6 shadow-xs space-y-4">
                  <h2 className="text-sm font-semibold text-foreground">Account Information</h2>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-2 border-b border-border">
                      <span className="text-muted-foreground">Account Email</span>
                      <span className="font-mono text-foreground">{user.email}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border">
                      <span className="text-muted-foreground">Unique User ID</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{user.id}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border">
                      <span className="text-muted-foreground">Account Created</span>
                      <span className="text-foreground">
                        {user.created_at
                          ? new Date(user.created_at).toLocaleDateString()
                          : "Active"}
                      </span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-muted-foreground">Sign-in Providers</span>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-muted font-medium text-foreground">
                          {user.app_metadata?.provider || "email/oauth"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Change Password Card */}
                <div className="border border-border rounded-xl bg-card p-6 shadow-xs space-y-4">
                  <h2 className="text-sm font-semibold text-foreground">Change Password</h2>
                  <form onSubmit={handleChangePassword} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="new_pass" className="text-xs font-medium">
                        New Password
                      </Label>
                      <Input
                        id="new_pass"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        className="text-xs h-9"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="confirm_pass" className="text-xs font-medium">
                        Confirm New Password
                      </Label>
                      <Input
                        id="confirm_pass"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repeat new password"
                        className="text-xs h-9"
                      />
                    </div>
                    <div className="pt-2 flex justify-end">
                      <Button
                        type="submit"
                        disabled={changingPassword || !newPassword}
                        className="text-xs font-semibold h-9 px-4"
                      >
                        {changingPassword ? "Updating..." : "Update password"}
                      </Button>
                    </div>
                  </form>
                </div>

                {/* Danger Zone */}
                <div className="border border-destructive/30 rounded-xl bg-destructive/5 p-6 space-y-3">
                  <h2 className="text-sm font-semibold text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" /> Danger Zone
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Deleting your account will permanently remove all your repositories, commits,
                    personal access tokens, and profile data. This action cannot be undone.
                  </p>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (
                        confirm(
                          "Are you sure you want to delete your GitBowl account? All your repositories will be deleted.",
                        )
                      ) {
                        toast.error(
                          "Account deletion requested. Please contact support to finalize.",
                        );
                      }
                    }}
                    className="text-xs font-semibold h-8"
                  >
                    Delete my account
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
