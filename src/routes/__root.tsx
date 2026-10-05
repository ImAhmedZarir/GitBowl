import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import { BowlLogo } from "@/components/BowlLogo";
import { TopProgressBar } from "@/components/TopProgressBar";
import { MobileNav } from "@/components/MobileNav";
import { Search, Home, RefreshCw, Compass } from "lucide-react";
import {
  GITBOWL_KEYWORDS,
  SCHEMA_ORGANIZATION,
  SCHEMA_WEBAPPLICATION,
  SCHEMA_WEBSITE,
  SCHEMA_FAQ,
  SCHEMA_BREADCRUMBS,
} from "@/lib/seo-schemas";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-16 text-center">
      <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-3xl border border-primary/20 bg-primary/5 shadow-inner">
        <BowlLogo className="h-12 w-12 text-primary" />
        <span className="absolute -bottom-2 rounded-full border border-border bg-card px-2 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground shadow-xs">
          404
        </span>
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        This bowl is empty
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        The repository, branch, or page you were looking for doesn&apos;t exist or might have been
        made private.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
        >
          <Home className="h-4 w-4" /> Go to home
        </Link>
        <Link
          to="/explore"
          className="inline-flex items-center gap-2 rounded-md border border-input bg-card px-4 py-2 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-accent"
        >
          <Compass className="h-4 w-4 text-muted-foreground" /> Explore repositories
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-16 text-center">
      <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-3xl border border-destructive/20 bg-destructive/5 shadow-inner">
        <BowlLogo className="h-12 w-12 text-destructive" />
        <span className="absolute -bottom-2 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-destructive shadow-xs">
          500
        </span>
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        Something went wrong
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        The bowl encountered an unexpected server or network issue.
      </p>
      {error && (error as any).message && (
        <p className="mt-2 max-w-md text-xs font-mono text-destructive/80 bg-destructive/10 px-3 py-1.5 rounded-md border border-destructive/20 mx-auto">
          {(error as any).message}
        </p>
      )}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={() => {
            if (typeof window !== "undefined") {
              window.location.reload();
            } else {
              router.invalidate();
              reset();
            }
          }}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 cursor-pointer"
        >
          <RefreshCw className="h-4 w-4" /> Try again
        </button>
        <a
          href="/"
          className="inline-flex items-center gap-2 rounded-md border border-input bg-card px-4 py-2 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-accent"
        >
          <Home className="h-4 w-4 text-muted-foreground" /> Go home
        </a>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "GitBowl — High-Performance Git Code Hosting Platform" },
      {
        name: "description",
        content:
          "GitBowl is a high-performance Git repository hosting platform. Host, push, pull, edit, and collaborate on code with Smart-HTTP protocol, private and public repos, in-browser Monaco code editor, and instant 1-click GitHub migration.",
      },
      { name: "keywords", content: GITBOWL_KEYWORDS },
      { name: "author", content: "GitBowl (mail.gitbowl@gmail.com)" },
      { name: "creator", content: "GitBowl" },
      { name: "publisher", content: "GitBowl" },
      {
        name: "robots",
        content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
      },
      {
        name: "googlebot",
        content: "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1",
      },
      {
        name: "bingbot",
        content: "index, follow, max-snippet:-1, max-image-preview:large",
      },
      { name: "google-site-verification", content: "googlec7847597a5a4c1ac" },
      { name: "msvalidate.01", content: "4D0C547C313C9EBDC216C37E55288BFA" },
      { name: "theme-color", content: "#0B132B" },
      { name: "color-scheme", content: "dark light" },
      { name: "application-name", content: "GitBowl" },
      { name: "apple-mobile-web-app-title", content: "GitBowl" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "rating", content: "general" },
      { name: "distribution", content: "global" },
      { name: "revisit-after", content: "1 days" },

      // OpenGraph
      { property: "og:site_name", content: "GitBowl" },
      { property: "og:locale", content: "en_US" },
      { property: "og:type", content: "website" },
      {
        property: "og:title",
        content: "GitBowl — High-Performance Git Code Hosting Platform",
      },
      {
        property: "og:description",
        content:
          "Host, push, pull, and edit code with Smart-HTTP Git protocol, unlimited public and private repositories, and 1-click GitHub repository import.",
      },
      { property: "og:url", content: "https://gitbowl.zone.id/" },
      { property: "og:image", content: "https://gitbowl.zone.id/og-image.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:alt", content: "GitBowl — Your code, in a bowl." },
      { property: "og:email", content: "mail.gitbowl@gmail.com" },

      // Twitter Cards
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@gitbowl" },
      { name: "twitter:creator", content: "@gitbowl" },
      {
        name: "twitter:title",
        content: "GitBowl — High-Performance Git Code Hosting Platform",
      },
      {
        name: "twitter:description",
        content:
          "Lightweight, high-performance Git hosting platform with smart-HTTP protocol, repositories, commits, and built-in web editor.",
      },
      { name: "twitter:image", content: "https://gitbowl.zone.id/og-image.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
      },
      { rel: "canonical", href: "https://gitbowl.zone.id/" },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "alternate icon", href: "/favicon.ico" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(SCHEMA_ORGANIZATION),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify(SCHEMA_WEBAPPLICATION),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify(SCHEMA_WEBSITE),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify(SCHEMA_FAQ),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify(SCHEMA_BREADCRUMBS),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("gitbowl-theme")==="light")document.documentElement.classList.remove("dark")}catch(e){}`,
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TopProgressBar />
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <MobileNav />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
