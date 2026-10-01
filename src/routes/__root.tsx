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
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import { BowlLogo } from "@/components/BowlLogo";
import { TopProgressBar } from "@/components/TopProgressBar";
import { Search, Home, RefreshCw, Compass } from "lucide-react";

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
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

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
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
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
      { title: "GitBowl — host, share and edit your code" },
      {
        name: "description",
        content:
          "GitBowl is a lightweight code hosting platform with repositories, commits, forks, stars and a built-in editor.",
      },
      { property: "og:title", content: "GitBowl — host, share and edit your code" },
      {
        property: "og:description",
        content:
          "GitBowl is a lightweight code hosting platform with repositories, commits, forks, stars and a built-in editor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
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

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TopProgressBar />
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
