// src/components/MobileNav.tsx
// Mobile Bottom Navigation Bar (Section 5.4)
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Search, GitPullRequest, CircleDot, User } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function MobileNav() {
  const { profile } = useAuth();
  const router = useRouterState();
  const currentPath = router.location.pathname;

  const userPath = profile?.username ? `/${profile.username}` : "/auth";

  const navItems = [
    { label: "Home", to: "/", icon: Home, active: currentPath === "/" },
    { label: "Search", to: "/search", icon: Search, active: currentPath.startsWith("/search") },
    {
      label: "Pulls",
      to: "/pulls",
      icon: GitPullRequest,
      active: currentPath.startsWith("/pulls"),
    },
    { label: "Issues", to: "/issues", icon: CircleDot, active: currentPath.startsWith("/issues") },
    {
      label: "You",
      to: userPath,
      icon: User,
      active: profile?.username ? currentPath === `/${profile.username}` : currentPath === "/auth",
    },
  ];

  return (
    <nav
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border/80 bg-background/95 backdrop-blur-md pb-safe"
    >
      <div className="grid grid-cols-5 h-14 items-center">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              to={item.to}
              className={`flex flex-col items-center justify-center gap-1 h-full text-[10px] font-medium transition-colors ${
                item.active
                  ? "text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
