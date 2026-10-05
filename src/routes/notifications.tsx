// src/routes/notifications.tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CheckCircle2,
  Trash2,
  Star,
  GitPullRequest,
  CircleDot,
  GitCommitHorizontal,
  Cloud,
  Shield,
  ExternalLink,
  Inbox,
  Filter,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [{ title: "Notifications — GitBowl" }],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["user-notifications", user?.id],
    queryFn: async () => {
      if (!user) return { notifications: [], unreadCount: 0 };
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) return { notifications: [], unreadCount: 0 };

      const res = await fetch("/api/notifications/", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { notifications: [], unreadCount: 0 };
      return res.json();
    },
    enabled: !!user,
  });

  const markAllMutation = useMutation({
    mutationFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch("/api/notifications/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "mark_all_read" }),
      });
      if (!res.ok) throw new Error("Failed to mark all as read");
      return res.json();
    },
    onSuccess: () => {
      toast.success("All notifications marked as read");
      queryClient.invalidateQueries({ queryKey: ["user-notifications"] });
    },
  });

  const markOneMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch("/api/notifications/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "mark_read", notificationId: id }),
      });
      if (!res.ok) throw new Error("Failed to mark as read");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-notifications"] });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch("/api/notifications/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "clear_all" }),
      });
      if (!res.ok) throw new Error("Failed to clear notifications");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Notifications cleared");
      queryClient.invalidateQueries({ queryKey: ["user-notifications"] });
    },
  });

  if (!user) {
    return (
      <AppShell>
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold">Sign in to view notifications</h2>
          <p className="text-sm text-muted-foreground mt-2 mb-6">
            Track repository updates, stars, code reviews, and releases in one place.
          </p>
          <Button asChild>
            <Link to="/auth">Sign In</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  const allItems: any[] = data?.notifications || [];
  const unreadCount: number = data?.unreadCount || 0;
  const filtered = filter === "unread" ? allItems.filter((n) => !n.is_read) : allItems;

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "star":
        return <Star className="h-4 w-4 text-amber-500 fill-amber-500/20" />;
      case "pr":
        return <GitPullRequest className="h-4 w-4 text-purple-500" />;
      case "issue":
        return <CircleDot className="h-4 w-4 text-emerald-500" />;
      case "commit":
        return <GitCommitHorizontal className="h-4 w-4 text-blue-500" />;
      case "sync":
        return <Cloud className="h-4 w-4 text-sky-500" />;
      case "admin":
        return <Shield className="h-4 w-4 text-emerald-600" />;
      default:
        return <Bell className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Header bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-border/80 gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Notifications</h1>
              {unreadCount > 0 && (
                <Badge variant="default" className="bg-primary text-white text-xs px-2 py-0.5">
                  {unreadCount} new
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Real-time activity across your repositories, organizations, and team collaborations.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-8 gap-1.5"
                onClick={() => markAllMutation.mutate()}
                disabled={markAllMutation.isPending}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Mark all as read
              </Button>
            )}
            {allItems.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-8 text-muted-foreground hover:text-destructive gap-1.5"
                onClick={() => {
                  if (confirm("Clear all notifications?")) clearAllMutation.mutate();
                }}
                disabled={clearAllMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear all
              </Button>
            )}
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 mt-4 mb-6">
          <Button
            variant={filter === "all" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setFilter("all")}
            className="text-xs h-7 px-3"
          >
            All ({allItems.length})
          </Button>
          <Button
            variant={filter === "unread" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setFilter("unread")}
            className="text-xs h-7 px-3"
          >
            Unread ({unreadCount})
          </Button>
        </div>

        {/* Notifications List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 rounded-xl border border-border/60 bg-card/60 animate-pulse"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border rounded-xl bg-card/40">
            <Inbox className="h-10 w-10 text-muted-foreground/60 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-foreground">
              {filter === "unread" ? "You're all caught up!" : "No notifications yet"}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              When someone stars your repo, opens a pull request, or comments on an issue, it will
              appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((item) => (
              <div
                key={item.id}
                onClick={() => {
                  if (!item.is_read) markOneMutation.mutate(item.id);
                }}
                className={`group flex items-start justify-between p-4 rounded-xl border transition-all ${
                  item.is_read
                    ? "border-border/60 bg-card/40 opacity-80 hover:opacity-100 hover:bg-card/70"
                    : "border-primary/30 bg-primary/5 shadow-2xs hover:bg-primary/10"
                }`}
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="mt-0.5 p-2 rounded-lg bg-background border border-border/80 shrink-0">
                    {getTypeIcon(item.type)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-foreground truncate">{item.title}</p>
                      {!item.is_read && (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                      )}
                    </div>
                    {item.content && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {item.content}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                      <span>
                        {new Date(item.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {item.link && item.link !== "/" && (
                        <Link
                          to={item.link}
                          className="text-primary hover:underline flex items-center gap-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View details <ExternalLink className="h-2.5 w-2.5" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>

                {!item.is_read && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Mark as read"
                    onClick={(e) => {
                      e.stopPropagation();
                      markOneMutation.mutate(item.id);
                    }}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
