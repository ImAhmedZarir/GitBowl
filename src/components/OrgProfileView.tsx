// src/components/OrgProfileView.tsx
import { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Building2,
  Users,
  BookMarked,
  Settings as SettingsIcon,
  Plus,
  Shield,
  Search,
  Download,
  Trash2,
  Lock,
  Globe,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { RepoCard } from "@/components/RepoCard";
import { supabase } from "@/integrations/supabase/client";

export interface OrgProfileViewProps {
  org: {
    id: string;
    name: string;
    slug: string;
    display_name?: string | null;
    description?: string | null;
    avatar_url?: string | null;
    plan: string;
  };
  repos: any[];
  members: any[];
  teams: any[];
  currentUser: any;
  currentTab: string;
  onTabChange: (tab: string) => void;
  onRefresh: () => void;
}

export function OrgProfileView({
  org,
  repos,
  members,
  teams,
  currentUser,
  currentTab,
  onTabChange,
  onRefresh,
}: OrgProfileViewProps) {
  const [repoSearch, setRepoSearch] = useState("");
  const [activeSettingsTab, setActiveSettingsTab] = useState<
    "general" | "members" | "teams" | "sso" | "audit"
  >("general");

  // Current user's membership role in this org
  const currentMember = members.find((m) => m.user?.id === currentUser?.id);
  const isAdmin = currentMember && ["owner", "admin"].includes(currentMember.role);
  const isOwner = currentMember && currentMember.role === "owner";

  // Filtered repos
  const filteredRepos = useMemo(() => {
    return repos.filter((r) => {
      const q = repoSearch.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q))
      );
    });
  }, [repos, repoSearch]);

  // General settings state
  const [displayName, setDisplayName] = useState(org.display_name || org.name);
  const [description, setDescription] = useState(org.description || "");
  const [savingGeneral, setSavingGeneral] = useState(false);

  // Invite member state
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);

  // Create team state
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDesc, setNewTeamDesc] = useState("");
  const [newTeamPrivacy, setNewTeamPrivacy] = useState<"visible" | "secret">("visible");
  const [creatingTeam, setCreatingTeam] = useState(false);

  // SSO settings state
  const [ssoProvider, setSsoProvider] = useState("oidc");
  const [ssoIssuer, setSsoIssuer] = useState("");
  const [ssoClientId, setSsoClientId] = useState("");
  const [ssoUrl, setSsoUrl] = useState("");
  const [ssoEnforced, setSsoEnforced] = useState(false);
  const [savingSso, setSavingSso] = useState(false);

  // Audit logs state
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditActionFilter, setAuditActionFilter] = useState("");

  async function handleSaveGeneral() {
    setSavingGeneral(true);
    try {
      const { error } = await supabase
        .from("orgs" as any)
        .update({
          display_name: displayName.trim(),
          description: description.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", org.id);

      if (error) throw error;
      toast.success("Organization profile updated");
      onRefresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to update organization");
    } finally {
      setSavingGeneral(false);
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteUsername.trim()) return;
    setInviting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch("/api/orgs/members", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
        },
        body: JSON.stringify({
          orgSlug: org.slug,
          username: inviteUsername.trim(),
          role: inviteRole,
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Failed to add member");

      toast.success(`Added @${inviteUsername} to ${org.name}`);
      setInviteUsername("");
      onRefresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to add member");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveMember(userId: string, username: string) {
    if (!confirm(`Are you sure you want to remove @${username} from ${org.name}?`)) return;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch(`/api/orgs/members?orgSlug=${org.slug}&userId=${userId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
        },
      });

      if (!res.ok) throw new Error("Failed to remove member");
      toast.success(`Removed @${username}`);
      onRefresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    setCreatingTeam(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch("/api/orgs/teams", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
        },
        body: JSON.stringify({
          orgSlug: org.slug,
          name: newTeamName.trim(),
          description: newTeamDesc.trim(),
          privacy: newTeamPrivacy,
          action: "create_team",
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Failed to create team");

      toast.success(`Created team ${newTeamName}`);
      setNewTeamName("");
      setNewTeamDesc("");
      onRefresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to create team");
    } finally {
      setCreatingTeam(false);
    }
  }

  async function loadAuditLogs() {
    setLoadingAudit(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      let url = `/api/orgs/audit-log?orgSlug=${org.slug}&format=json`;
      if (auditActionFilter) url += `&action=${encodeURIComponent(auditActionFilter)}`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
        },
      });

      if (res.ok) {
        const json = await res.json();
        setAuditLogs(json.logs || []);
      }
    } catch (e: any) {
      console.warn("Could not load audit logs:", e);
    } finally {
      setLoadingAudit(false);
    }
  }

  async function exportAudit(format: "csv" | "json") {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const url = `/api/orgs/audit-log?orgSlug=${org.slug}&format=${format}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
        },
      });

      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `${org.slug}-audit-log.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(`Downloaded audit log as ${format.toUpperCase()}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to export audit log");
    }
  }

  async function handleSaveSso(e: React.FormEvent) {
    e.preventDefault();
    setSavingSso(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch("/api/orgs/sso", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
        },
        body: JSON.stringify({
          orgSlug: org.slug,
          provider: ssoProvider,
          issuer: ssoIssuer,
          clientId: ssoClientId,
          ssoUrl,
          isEnforced: ssoEnforced,
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Failed to update SSO");
      toast.success("SSO configuration updated");
    } catch (e: any) {
      toast.error(e.message || "Failed to update SSO");
    } finally {
      setSavingSso(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* ORGANIZATION HERO BANNER */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-6 border-b border-border">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xl shrink-0">
            {org.avatar_url ? (
              <img src={org.avatar_url} alt="" className="h-full w-full object-cover rounded-xl" />
            ) : (
              <Building2 className="h-8 w-8" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">{org.display_name || org.name}</h1>
              <Badge variant="outline" className="capitalize text-[11px]">
                {org.plan} plan
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">@{org.slug}</p>
            {org.description && (
              <p className="text-xs text-foreground/80 mt-1 max-w-xl">{org.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild size="sm" className="h-8 text-xs gap-1.5">
            <Link to="/new">
              <Plus className="h-3.5 w-3.5" />
              <span>New repository</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* TOP TABS NAVIGATION */}
      <div className="flex items-center gap-1 border-b border-border mt-4 mb-6">
        <button
          onClick={() => onTabChange("repositories")}
          className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
            currentTab === "repositories"
              ? "border-primary text-foreground font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <BookMarked className="h-4 w-4" />
          <span>Repositories</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{repos.length}</span>
        </button>

        <button
          onClick={() => onTabChange("teams")}
          className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
            currentTab === "teams"
              ? "border-primary text-foreground font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Shield className="h-4 w-4" />
          <span>Teams</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{teams.length}</span>
        </button>

        <button
          onClick={() => onTabChange("people")}
          className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
            currentTab === "people"
              ? "border-primary text-foreground font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="h-4 w-4" />
          <span>People</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{members.length}</span>
        </button>

        {isAdmin && (
          <button
            onClick={() => {
              onTabChange("settings");
              if (activeSettingsTab === "audit") loadAuditLogs();
            }}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              currentTab === "settings"
                ? "border-primary text-foreground font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <SettingsIcon className="h-4 w-4" />
            <span>Settings</span>
          </button>
        )}
      </div>

      {/* TAB 1: REPOSITORIES */}
      {currentTab === "repositories" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Find a repository..."
                value={repoSearch}
                onChange={(e) => setRepoSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredRepos.map((r) => (
              <RepoCard
                key={r.id}
                repo={{
                  ...r,
                  owner_username: org.slug,
                }}
              />
            ))}
            {filteredRepos.length === 0 && (
              <div className="col-span-full py-12 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
                No repositories found matching your query.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: TEAMS */}
      {currentTab === "teams" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Teams in {org.name}</h3>
              <p className="text-xs text-muted-foreground">
                Organize members and manage permissions across repositories.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {teams.map((t) => (
              <div
                key={t.id}
                className="p-4 rounded-xl border border-border bg-card space-y-2 shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-foreground">@{t.slug}</h4>
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {t.privacy}
                  </Badge>
                </div>
                <p className="text-xs font-medium text-foreground">{t.name}</p>
                {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
              </div>
            ))}
            {teams.length === 0 && (
              <div className="col-span-full py-12 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
                No teams created yet. {isAdmin && "Go to Settings → Teams to create one."}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: PEOPLE / MEMBERS */}
      {currentTab === "people" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Members of {org.name}</h3>
              <p className="text-xs text-muted-foreground">
                All accounts with access to organization repositories.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
            {members.map((m) => (
              <div key={m.id} className="p-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center font-bold text-xs uppercase overflow-hidden">
                    {m.user?.avatar_url ? (
                      <img src={m.user.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      m.user?.username?.slice(0, 2) || "U"
                    )}
                  </div>
                  <div>
                    <Link
                      to="/$owner"
                      params={{ owner: m.user?.username || "user" }}
                      className="font-semibold text-foreground hover:underline"
                    >
                      {m.user?.display_name || m.user?.username}
                    </Link>
                    <p className="text-[11px] text-muted-foreground">@{m.user?.username}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="capitalize text-[10px]">
                    {m.role}
                  </Badge>
                  {isAdmin && m.user?.id !== currentUser?.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveMember(m.user.id, m.user.username)}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      title="Remove member"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: SETTINGS */}
      {currentTab === "settings" && isAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Settings Sidebar */}
          <aside className="md:col-span-3 space-y-1">
            {[
              { id: "general", label: "General" },
              { id: "members", label: "Member Management" },
              { id: "teams", label: "Teams Management" },
              { id: "sso", label: "SSO & Security" },
              { id: "audit", label: "Enterprise Audit Log" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveSettingsTab(tab.id as any);
                  if (tab.id === "audit") loadAuditLogs();
                }}
                className={`w-full text-left px-3 py-2 text-xs rounded-lg font-medium transition-colors ${
                  activeSettingsTab === tab.id
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </aside>

          {/* Settings Canvas */}
          <div className="md:col-span-9 rounded-xl border border-border bg-card p-6 shadow-xs">
            {/* General */}
            {activeSettingsTab === "general" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Organization Profile</h3>
                  <p className="text-xs text-muted-foreground">
                    Public information for {org.name}.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Display Name</Label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Description</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="text-xs"
                    rows={3}
                  />
                </div>
                <Button
                  size="sm"
                  onClick={handleSaveGeneral}
                  disabled={savingGeneral}
                  className="h-8 text-xs"
                >
                  {savingGeneral ? "Saving..." : "Save changes"}
                </Button>
              </div>
            )}

            {/* Members */}
            {activeSettingsTab === "members" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Invite New Member</h3>
                  <p className="text-xs text-muted-foreground">
                    Add registered GitBowl users to your organization.
                  </p>
                </div>
                <form onSubmit={handleAddMember} className="flex gap-2">
                  <Input
                    placeholder="Enter username (e.g. alice)"
                    value={inviteUsername}
                    onChange={(e) => setInviteUsername(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                  <Button
                    size="sm"
                    disabled={inviting || !inviteUsername.trim()}
                    className="h-8 text-xs"
                  >
                    {inviting ? "Adding..." : "Add member"}
                  </Button>
                </form>
              </div>
            )}

            {/* Teams */}
            {activeSettingsTab === "teams" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Create New Team</h3>
                  <p className="text-xs text-muted-foreground">
                    Group users and configure repository access permissions.
                  </p>
                </div>
                <form onSubmit={handleCreateTeam} className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Team Name</Label>
                    <Input
                      placeholder="e.g. Backend Engineers"
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Description</Label>
                    <Input
                      placeholder="e.g. Core API services team"
                      value={newTeamDesc}
                      onChange={(e) => setNewTeamDesc(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <Button
                    size="sm"
                    disabled={creatingTeam || !newTeamName.trim()}
                    className="h-8 text-xs"
                  >
                    {creatingTeam ? "Creating..." : "Create team"}
                  </Button>
                </form>
              </div>
            )}

            {/* SSO & Security */}
            {activeSettingsTab === "sso" && (
              <form onSubmit={handleSaveSso} className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Single Sign-On (SSO)</h3>
                  <p className="text-xs text-muted-foreground">
                    Connect enterprise SAML or OIDC identity provider.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">SSO Provider</Label>
                  <select
                    value={ssoProvider}
                    onChange={(e) => setSsoProvider(e.target.value)}
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="oidc">OpenID Connect (OIDC)</option>
                    <option value="saml">SAML 2.0</option>
                    <option value="google_workspace">Google Workspace</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Issuer / Entity ID</Label>
                  <Input
                    placeholder="https://identity.company.com"
                    value={ssoIssuer}
                    onChange={(e) => setSsoIssuer(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Client ID / App ID</Label>
                  <Input
                    placeholder="client_12345"
                    value={ssoClientId}
                    onChange={(e) => setSsoClientId(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Sign-In / Discovery URL</Label>
                  <Input
                    placeholder="https://identity.company.com/sso"
                    value={ssoUrl}
                    onChange={(e) => setSsoUrl(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
                  <div>
                    <p className="text-xs font-semibold text-foreground">
                      Enforce SSO Authentication
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Require all members to authenticate via SSO to access organization resources.
                    </p>
                  </div>
                  <Switch checked={ssoEnforced} onCheckedChange={setSsoEnforced} />
                </div>
                <Button size="sm" disabled={savingSso} className="h-8 text-xs">
                  {savingSso ? "Saving..." : "Save SSO Configuration"}
                </Button>
              </form>
            )}

            {/* Audit Log */}
            {activeSettingsTab === "audit" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Audit Log</h3>
                    <p className="text-xs text-muted-foreground">
                      Track security events, member activity, and repository changes.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => exportAudit("csv")}
                      className="h-7 text-xs gap-1"
                    >
                      <Download className="h-3 w-3" /> CSV
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => exportAudit("json")}
                      className="h-7 text-xs gap-1"
                    >
                      <Download className="h-3 w-3" /> JSON
                    </Button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Input
                    placeholder="Filter by action (e.g. org.member_add, repo.create)..."
                    value={auditActionFilter}
                    onChange={(e) => setAuditActionFilter(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={loadAuditLogs}
                    className="h-8 text-xs"
                  >
                    Filter
                  </Button>
                </div>

                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/40 border-b border-border text-[11px] text-muted-foreground uppercase">
                      <tr>
                        <th className="p-2.5">Action</th>
                        <th className="p-2.5">Actor</th>
                        <th className="p-2.5">Target</th>
                        <th className="p-2.5">IP Address</th>
                        <th className="p-2.5">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-muted/20">
                          <td className="p-2.5 font-mono text-[11px] text-foreground font-semibold">
                            {log.action}
                          </td>
                          <td className="p-2.5 text-muted-foreground">
                            {log.actor?.username || "system"}
                          </td>
                          <td className="p-2.5 font-mono text-[11px] text-muted-foreground truncate max-w-[120px]">
                            {log.target_type || "-"}:{log.target_id || "-"}
                          </td>
                          <td className="p-2.5 font-mono text-[11px] text-muted-foreground">
                            {log.ip_address || "127.0.0.1"}
                          </td>
                          <td className="p-2.5 text-muted-foreground">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                      {auditLogs.length === 0 && !loadingAudit && (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-muted-foreground">
                            No audit log records found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
