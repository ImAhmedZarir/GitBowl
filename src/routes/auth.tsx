import { useState, useEffect } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  ArrowRight,
  Terminal,
  ShieldCheck,
  Sparkles,
  KeyRound,
  Lock,
  Mail,
  User,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  firebaseAuth,
  googleProvider,
  githubProvider,
  signInWithPopup,
  GithubAuthProvider,
} from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BowlLogo } from "@/components/BowlLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { redirect?: string | undefined } => ({
    redirect: typeof s["redirect"] === "string" ? (s["redirect"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in to GitBowl — Your code, in a bowl." },
      {
        name: "description",
        content:
          "Sign in or create your GitBowl account to host, push, and share code repositories.",
      },
      { property: "og:title", content: "Sign in to GitBowl" },
      {
        property: "og:description",
        content:
          "Sign in or create your GitBowl account to host, push, and share code repositories.",
      },
    ],
  }),
  component: AuthPage,
});

function calculatePasswordStrength(pass: string): { score: number; label: string; color: string } {
  if (!pass) return { score: 0, label: "Empty", color: "bg-muted" };
  let score = 0;
  if (pass.length >= 8) score++;
  if (/[A-Z]/.test(pass)) score++;
  if (/[0-9]/.test(pass)) score++;
  if (/[^A-Za-z0-9]/.test(pass)) score++;

  if (score <= 1) return { score: 1, label: "Weak", color: "bg-destructive" };
  if (score <= 3) return { score: 2, label: "Medium", color: "bg-warning" };
  return { score: 3, label: "Strong", color: "bg-success" };
}

function AuthPage() {
  const search = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New account OAuth username onboarding
  const [onboardingData, setOnboardingData] = useState<{
    userId: string;
    email: string;
    displayName: string;
    initialUsername: string;
    redirectUrl: string;
  } | null>(null);
  const [chosenUsername, setChosenUsername] = useState("");
  const [chosenDisplayName, setChosenDisplayName] = useState("");
  const [onboardingChecking, setOnboardingChecking] = useState(false);
  const [onboardingAvailable, setOnboardingAvailable] = useState<boolean | null>(null);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [completingOnboarding, setCompletingOnboarding] = useState(false);

  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user && !onboardingData) {
      navigate({ to: search.redirect || "/", replace: true });
    }
  }, [user, navigate, search.redirect, onboardingData]);

  // Live validation for chosen onboarding username
  useEffect(() => {
    const clean = chosenUsername.trim().toLowerCase();
    if (!clean || !onboardingData) {
      setOnboardingAvailable(null);
      setOnboardingError(null);
      setOnboardingChecking(false);
      return;
    }

    if (clean.length < 3) {
      setOnboardingAvailable(false);
      setOnboardingError("Username must be at least 3 characters");
      return;
    }

    if (!/^[a-z0-9]([a-z0-9-]{1,37}[a-z0-9])?$/.test(clean)) {
      setOnboardingAvailable(false);
      setOnboardingError("Letters, numbers, and single hyphens only");
      return;
    }

    setOnboardingChecking(true);
    setOnboardingError(null);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/auth/check-username?username=${encodeURIComponent(clean)}&excludeUserId=${onboardingData.userId}`,
        );
        const data = await res.json();
        setOnboardingAvailable(data.available);
        if (!data.available) {
          setOnboardingError(data.reason || "Username is already taken");
        } else {
          setOnboardingError(null);
        }
      } catch {
        setOnboardingAvailable(null);
      } finally {
        setOnboardingChecking(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [chosenUsername, onboardingData]);

  async function handleCompleteOnboarding(e: React.FormEvent) {
    e.preventDefault();
    if (!onboardingData) return;

    const cleanUser = chosenUsername.trim().toLowerCase();
    if (!cleanUser || onboardingError) {
      toast.error(onboardingError || "Please choose a valid available username");
      return;
    }

    setCompletingOnboarding(true);
    try {
      const res = await fetch("/api/auth/complete-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: onboardingData.userId,
          username: cleanUser,
          displayName: chosenDisplayName.trim() || cleanUser,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to finalize registration");
      }

      toast.success(`Welcome to GitBowl, @${cleanUser}!`);
      const target = onboardingData.redirectUrl;
      setOnboardingData(null);
      navigate({ to: target || "/" });
    } catch (err: any) {
      toast.error(err.message || "Failed to set username");
    } finally {
      setCompletingOnboarding(false);
    }
  }

  // Live username availability check on signup
  useEffect(() => {
    const trimmed = username.trim().toLowerCase();
    if (!trimmed || mode !== "signup") {
      setUsernameAvailable(null);
      return;
    }

    const validRegex = /^[a-z0-9-]{3,39}$/;
    if (!validRegex.test(trimmed)) {
      setUsernameAvailable(false);
      return;
    }

    let active = true;
    setCheckingUsername(true);

    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", trimmed)
          .maybeSingle();

        if (active) {
          if (!error && data) {
            setUsernameAvailable(false); // Taken
          } else {
            setUsernameAvailable(true); // Available
          }
        }
      } catch {
        if (active) setUsernameAvailable(null);
      } finally {
        if (active) setCheckingUsername(false);
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [username, mode]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setBusy(true);

    const loginId = identifier.trim();
    if (!loginId || !password) {
      setErrorMessage("Please enter your username or email and password");
      setBusy(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: loginId, password }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Invalid credentials");
      }

      if (data.session) {
        const { error: sessionError } = await supabase.auth.setSession(data.session);
        if (sessionError) throw sessionError;
      }

      toast.success("Welcome back to GitBowl!");
      navigate({ to: search.redirect || "/" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid credentials";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleSignIn() {
    setBusy(true);
    setErrorMessage(null);
    try {
      const res = await signInWithPopup(firebaseAuth, googleProvider);
      const fbUser = res.user;

      if (!fbUser.email) {
        throw new Error("Google account did not provide an email address.");
      }

      // Sync user with backend to establish Supabase session
      const syncRes = await fetch("/api/auth/google-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: fbUser.email,
          displayName: fbUser.displayName || fbUser.email.split("@")[0],
          photoURL: fbUser.photoURL,
        }),
      });

      const syncData = await syncRes.json();
      if (!syncRes.ok || syncData.error) {
        throw new Error(syncData.error || "Failed to establish server session");
      }

      // Complete session establishment in Supabase client
      if (syncData.hashed_token) {
        const { error: otpError } = await supabase.auth.verifyOtp({
          token_hash: syncData.hashed_token,
          type: "magiclink",
        });
        if (otpError) throw otpError;
      }

      if (syncData.isNewUser) {
        setOnboardingData({
          userId: syncData.userId,
          email: fbUser.email,
          displayName: syncData.displayName || fbUser.displayName || "",
          initialUsername: syncData.suggestedUsername || "",
          redirectUrl: search.redirect || "/",
        });
        setChosenUsername(syncData.suggestedUsername || "");
        setChosenDisplayName(syncData.displayName || fbUser.displayName || "");
        toast.info("Welcome to GitBowl! Choose your developer handle to complete setup.");
        return;
      }

      toast.success(`Welcome back to GitBowl, ${fbUser.displayName || fbUser.email}!`);
      navigate({ to: search.redirect || "/" });
    } catch (err: any) {
      if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") {
        setBusy(false);
        return;
      }
      const msg = err instanceof Error ? err.message : "Failed to sign in with Google";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleGitHubSignIn() {
    setBusy(true);
    setErrorMessage(null);
    try {
      const res = await signInWithPopup(firebaseAuth, githubProvider);
      const fbUser = res.user;
      const credential = GithubAuthProvider.credentialFromResult(res);
      const ghAccessToken = credential?.accessToken || null;

      if (ghAccessToken) {
        localStorage.setItem("gitbowl_github_token", ghAccessToken);
      }

      const syncRes = await fetch("/api/auth/github-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: fbUser.email,
          displayName: fbUser.displayName || fbUser.email?.split("@")[0] || "developer",
          photoURL: fbUser.photoURL,
          githubToken: ghAccessToken,
        }),
      });

      const syncData = await syncRes.json();
      if (!syncRes.ok || syncData.error) {
        throw new Error(syncData.error || "Failed to establish server session");
      }

      if (syncData.hashed_token) {
        const { error: otpError } = await supabase.auth.verifyOtp({
          token_hash: syncData.hashed_token,
          type: "magiclink",
        });
        if (otpError) throw otpError;
      }

      if (syncData.isNewUser) {
        setOnboardingData({
          userId: syncData.userId,
          email: fbUser.email || "",
          displayName: syncData.displayName || fbUser.displayName || "developer",
          initialUsername: syncData.suggestedUsername || "",
          redirectUrl: search.redirect || "/new?tab=import",
        });
        setChosenUsername(syncData.suggestedUsername || "");
        setChosenDisplayName(syncData.displayName || fbUser.displayName || "developer");
        toast.info("Welcome to GitBowl! Choose your developer handle to complete setup.");
        return;
      }

      toast.success(`Signed in with GitHub! Welcome, ${fbUser.displayName || "developer"}!`);
      navigate({ to: search.redirect || "/new?tab=import" });
    } catch (err: any) {
      if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") {
        setBusy(false);
        return;
      }
      const msg = err instanceof Error ? err.message : "Failed to sign in with GitHub";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    const cleanUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9-]{3,39}$/.test(cleanUsername)) {
      setErrorMessage(
        "Username must be 3-39 characters and contain only lowercase letters, numbers, and dashes.",
      );
      return;
    }

    if (usernameAvailable === false) {
      setErrorMessage("That username is already taken. Please choose another.");
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { username: cleanUsername },
        },
      });
      if (error) throw error;
      if (!data.session) {
        setSent(true);
        return;
      }
      toast.success("Account created successfully!");
      navigate({ to: "/" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create account";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setBusy(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset`,
      });
      if (error) throw error;
      setResetSent(true);
      toast.success("Password reset email sent.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send reset email";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  const strength = calculatePasswordStrength(password);

  return (
    <div className="flex min-h-screen bg-background">
      {/* LEFT COLUMN: AUTH FORM */}
      <div className="flex flex-1 flex-col justify-between px-6 py-8 sm:px-12 lg:flex-none lg:w-[480px]">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold tracking-tight text-foreground">
            <BowlLogo className="h-6 w-6 text-primary" />
            <span className="text-base font-bold bg-gradient-to-r from-primary to-success bg-clip-text text-transparent">
              GitBowl
            </span>
          </Link>
          <ThemeToggle />
        </div>

        {/* Center Card */}
        <div className="mx-auto w-full max-w-sm py-8">
          {onboardingData ? (
            <div className="space-y-5">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-semibold mb-2">
                  🎉 Welcome to GitBowl!
                </div>
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  Choose your developer handle
                </h1>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  Your handle will be your public identity on GitBowl, used for your profile URL and
                  your Git remote repository clone paths.
                </p>
              </div>

              <form onSubmit={handleCompleteOnboarding} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="onboarding-name" className="text-xs font-medium">
                    Display Name
                  </Label>
                  <Input
                    id="onboarding-name"
                    type="text"
                    value={chosenDisplayName}
                    onChange={(e) => setChosenDisplayName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="h-9 text-xs"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="onboarding-username"
                    className="text-xs font-medium flex items-center justify-between"
                  >
                    <span>Username</span>
                    {onboardingChecking && (
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <RefreshCw className="h-3 w-3 animate-spin" /> Checking...
                      </span>
                    )}
                    {!onboardingChecking && onboardingAvailable === true && (
                      <span className="text-[11px] text-success flex items-center gap-1 font-medium">
                        <Check className="h-3 w-3" /> Available
                      </span>
                    )}
                    {!onboardingChecking && onboardingAvailable === false && (
                      <span className="text-[11px] text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {onboardingError || "Unavailable"}
                      </span>
                    )}
                  </Label>

                  <div className="flex rounded-md shadow-xs">
                    <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted/60 text-muted-foreground text-xs font-mono">
                      gitbowl.zone.id/
                    </span>
                    <Input
                      id="onboarding-username"
                      type="text"
                      required
                      value={chosenUsername}
                      onChange={(e) =>
                        setChosenUsername(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                      }
                      placeholder="username"
                      className="rounded-l-none h-9 text-xs font-mono"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    3-39 characters. Lowercase letters, numbers, and single hyphens.
                  </p>
                </div>

                {/* Preview Box */}
                {chosenUsername && (
                  <div className="rounded-lg border border-border/80 bg-muted/30 p-3 space-y-1 font-mono text-[11px]">
                    <div className="text-muted-foreground flex justify-between">
                      <span>Profile:</span>
                      <span className="text-foreground">gitbowl.zone.id/{chosenUsername}</span>
                    </div>
                    <div className="text-muted-foreground flex justify-between">
                      <span>Git Remote:</span>
                      <span className="text-primary truncate ml-2">
                        https://gitbowl.zone.id/api/public/git/{chosenUsername}/&lt;repo&gt;.git
                      </span>
                    </div>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={completingOnboarding || !chosenUsername || !!onboardingError}
                  className="w-full h-9 text-xs font-semibold"
                >
                  {completingOnboarding
                    ? "Finalizing account..."
                    : "Complete Setup & Enter GitBowl"}
                </Button>
              </form>
            </div>
          ) : sent ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Mail className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">Check your email</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                We sent an activation link to <strong className="text-foreground">{email}</strong>.
                Click it to confirm your email, then sign in below.
              </p>
              <Button
                variant="outline"
                className="w-full text-xs"
                onClick={() => {
                  setSent(false);
                  setMode("signin");
                }}
              >
                Back to sign in
              </Button>
            </div>
          ) : resetSent ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Check className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Reset link dispatched
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                If an account exists for <strong className="text-foreground">{email}</strong>, you
                will receive instructions shortly to choose a new password.
              </p>
              <Button
                variant="outline"
                className="w-full text-xs"
                onClick={() => {
                  setResetSent(false);
                  setMode("signin");
                }}
              >
                Back to sign in
              </Button>
            </div>
          ) : mode === "forgot" ? (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-foreground">Reset password</h1>
                <p className="mt-1 text-xs text-muted-foreground">
                  Enter your account email address and we&apos;ll send you a recovery link.
                </p>
              </div>

              {errorMessage && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="reset-email" className="text-xs">
                    Email address
                  </Label>
                  <Input
                    id="reset-email"
                    type="email"
                    required
                    placeholder="you@domain.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>

                <Button type="submit" disabled={busy} className="w-full h-9 text-xs font-semibold">
                  {busy ? "Sending link..." : "Send reset instructions"}
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signin");
                      setErrorMessage(null);
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    Back to sign in
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Sign in / Sign up Mode Switcher */}
              <div>
                <div className="flex rounded-lg border border-border bg-muted/40 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signin");
                      setErrorMessage(null);
                    }}
                    className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all ${
                      mode === "signin"
                        ? "bg-card text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signup");
                      setErrorMessage(null);
                    }}
                    className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all ${
                      mode === "signup"
                        ? "bg-card text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Create account
                  </button>
                </div>
              </div>

              {/* OAuth Providers: GitHub & Google */}
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGitHubSignIn}
                  disabled={busy}
                  className="w-full h-10 gap-2.5 text-xs font-semibold hover:bg-muted/80 border-border bg-card shadow-xs"
                >
                  <svg className="h-4 w-4 shrink-0 fill-current" viewBox="0 0 24 24">
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    />
                  </svg>
                  <span>Continue with GitHub</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGoogleSignIn}
                  disabled={busy}
                  className="w-full h-10 gap-2.5 text-xs font-semibold hover:bg-muted/80 border-border bg-card shadow-xs"
                >
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.66-5.17 3.66-9.12z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.13C3.27 21.43 7.33 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.58H1.25C.45 8.17 0 9.99 0 12s.45 3.83 1.25 5.42l4.03-3.13z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.27 2.57 1.25 6.58l4.03 3.13c.95-2.83 3.6-4.96 6.72-4.96z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </Button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase">
                  <span className="bg-card px-2 text-muted-foreground font-medium">
                    Or continue with
                  </span>
                </div>
              </div>

              {errorMessage && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* AUTH FORM */}
              <form
                onSubmit={mode === "signin" ? handleSignIn : handleSignUp}
                className="space-y-4"
              >
                {mode === "signup" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="username" className="text-xs">
                        Username
                      </Label>
                      {checkingUsername ? (
                        <span className="text-[10px] text-muted-foreground animate-pulse">
                          Checking...
                        </span>
                      ) : usernameAvailable === true ? (
                        <span className="text-[10px] text-success font-medium flex items-center gap-1">
                          <Check className="h-2.5 w-2.5" /> Available
                        </span>
                      ) : usernameAvailable === false ? (
                        <span className="text-[10px] text-destructive font-medium flex items-center gap-1">
                          <AlertCircle className="h-2.5 w-2.5" /> Taken or invalid
                        </span>
                      ) : null}
                    </div>
                    <div className="relative">
                      <Input
                        id="username"
                        type="text"
                        required
                        placeholder="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value.toLowerCase())}
                        className="h-9 text-xs font-mono"
                        autoCapitalize="none"
                        autoCorrect="off"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Only lowercase letters, numbers, and dashes (e.g. zarir, code-bowl).
                    </p>
                  </div>
                )}

                {mode === "signin" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="identifier" className="text-xs">
                      Username or email
                    </Label>
                    <Input
                      id="identifier"
                      type="text"
                      required
                      placeholder="username or you@domain.com"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      className="h-9 text-xs"
                      autoComplete="username"
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs">
                      Email address
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      placeholder="you@domain.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-9 text-xs"
                      autoComplete="email"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-xs">
                      Password
                    </Label>
                    {mode === "signin" && (
                      <button
                        type="button"
                        onClick={() => {
                          setMode("forgot");
                          setErrorMessage(null);
                        }}
                        className="text-[11px] text-primary hover:underline"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-9 pr-9 text-xs"
                      autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    />
                    <button
                      type="button"
                      aria-label="Toggle password visibility"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Password Strength Meter on Sign Up */}
                  {mode === "signup" && password && (
                    <div className="space-y-1 pt-1">
                      <div className="flex h-1 w-full gap-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full transition-all ${
                            strength.score >= 1 ? strength.color : "bg-transparent"
                          }`}
                          style={{ width: "33%" }}
                        />
                        <div
                          className={`h-full transition-all ${
                            strength.score >= 2 ? strength.color : "bg-transparent"
                          }`}
                          style={{ width: "33%" }}
                        />
                        <div
                          className={`h-full transition-all ${
                            strength.score >= 3 ? strength.color : "bg-transparent"
                          }`}
                          style={{ width: "34%" }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Password strength</span>
                        <span className="font-medium text-foreground">{strength.label}</span>
                      </div>
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={busy}
                  className="w-full h-9 text-xs font-semibold mt-2"
                >
                  {busy
                    ? "Processing..."
                    : mode === "signin"
                      ? "Sign in"
                      : "Create developer account"}
                </Button>
              </form>

              <p className="text-center text-[11px] text-muted-foreground leading-relaxed">
                By continuing, you agree to GitBowl&apos;s{" "}
                <Link
                  to="/tos"
                  className="text-primary font-medium underline hover:text-primary/80"
                >
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link
                  to="/privacy"
                  className="text-primary font-medium underline hover:text-primary/80"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          )}
        </div>

        {/* Bottom footer text */}
        <div className="text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} GitBowl. Your code, in a bowl.
        </div>
      </div>

      {/* RIGHT COLUMN: BRAND ILLUSTRATION & DEVELOPER HIGHLIGHTS */}
      <div className="hidden lg:flex flex-1 flex-col justify-between border-l border-border bg-card/60 p-12 relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-40 pointer-events-none" />

        <div className="relative z-10 flex items-center gap-2 text-xs font-semibold text-primary">
          <Sparkles className="h-4 w-4" /> GitBowl Cloud
        </div>

        <div className="relative z-10 max-w-lg space-y-6">
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            A developer platform built for speed and precision.
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Forget slow bloated interfaces. GitBowl gives you instantaneous git cloning over HTTPS,
            in-browser Monaco editing, and simple collaboration without enterprise overhead.
          </p>

          <div className="space-y-4 pt-2">
            {[
              {
                icon: Terminal,
                title: "Standard Git HTTPS Protocol",
                desc: "git clone, git pull, and git push with your terminal and token password.",
              },
              {
                icon: ShieldCheck,
                title: "Personal Access Tokens",
                desc: "Secure authentication for remote commands without sharing account credentials.",
              },
              {
                icon: KeyRound,
                title: "Instant Code Navigation",
                desc: "Jump anywhere in seconds with the ⌘K command palette and shortcut system.",
              },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <item.icon className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-foreground">{item.title}</h4>
                  <p className="text-[11px] text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 rounded-lg border border-border/70 bg-background/80 p-3 font-mono text-[11px] text-muted-foreground">
          <span className="text-success">$</span> git clone
          https://gitbowl.zone.id/developer/project.git
        </div>
      </div>
    </div>
  );
}
