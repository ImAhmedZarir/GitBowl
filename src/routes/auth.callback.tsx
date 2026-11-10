// src/routes/auth.callback.tsx
// OAuth Callback handler for Supabase authentication (Google, GitHub, magiclink)
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BowlLogo } from "@/components/BowlLogo";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSafeRedirect } from "@/lib/safe-redirect";

export const Route = createFileRoute("/auth/callback")({
  validateSearch: (search: Record<string, unknown>): {
    code?: string | undefined;
    error?: string | undefined;
    error_description?: string | undefined;
    redirect?: string | undefined;
    next?: string | undefined;
  } => ({
    code: typeof search["code"] === "string" ? search["code"] : undefined,
    error: typeof search["error"] === "string" ? search["error"] : undefined,
    error_description:
      typeof search["error_description"] === "string" ? search["error_description"] : undefined,
    redirect: typeof search["redirect"] === "string" ? search["redirect"] : undefined,
    next: typeof search["next"] === "string" ? search["next"] : undefined,
  }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [errorMsg, setErrorMsg] = useState<string | null>(search.error_description || search.error || null);

  useEffect(() => {
    let cancelled = false;

    async function handleCallback() {
      try {
        if (search.error || search.error_description) {
          setErrorMsg(search.error_description || search.error || "Authentication failed");
          return;
        }

        // 1. If code is present (PKCE flow), exchange for session
        if (search.code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(search.code);
          if (exchangeError) {
            throw exchangeError;
          }
        }

        // 2. Retrieve current session (either from code exchange or from hash detection by supabase client)
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const session = sessionData?.session;
        if (!session?.user) {
          // If no immediate session, wait briefly for auth listener
          await new Promise((resolve) => setTimeout(resolve, 600));
          const { data: retrySession } = await supabase.auth.getSession();
          if (!retrySession?.session?.user) {
            throw new Error("No active session found. Please try signing in again.");
          }
        }

        const user = session?.user;
        if (!user || cancelled) return;

        // 3. Inspect user profile in database to check onboarding state
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, username, onboarding_completed")
          .eq("id", user.id)
          .maybeSingle();

        const targetRedirect = getSafeRedirect(search.redirect || search.next || "/");

        // If profile does not exist or onboarding is incomplete, redirect to auth onboarding
        if (!profile || profile.onboarding_completed === false) {
          navigate({
            to: "/auth",
            search: {
              redirect: targetRedirect,
            },
            replace: true,
          });
          return;
        }

        // Otherwise onboarding is complete, navigate to target destination
        navigate({
          to: targetRedirect,
          replace: true,
        });
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Authentication callback failed";
          setErrorMsg(message);
        }
      }
    }

    void handleCallback();

    return () => {
      cancelled = true;
    };
  }, [search, navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm flex flex-col items-center text-center space-y-4">
        <BowlLogo className="h-10 w-10 text-primary animate-pulse" />

        {errorMsg ? (
          <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-sm space-y-3 w-full">
            <div className="flex items-center justify-center gap-2 font-medium">
              <AlertCircle className="h-4 w-4" />
              <span>Authentication Error</span>
            </div>
            <p className="text-xs text-muted-foreground">{errorMsg}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate({ to: "/auth", replace: true })}
              className="w-full"
            >
              Back to Sign In
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground font-medium">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>Completing sign in...</span>
            </div>
            <p className="text-xs text-muted-foreground">Connecting your GitBowl account</p>
          </div>
        )}
      </div>
    </div>
  );
}
