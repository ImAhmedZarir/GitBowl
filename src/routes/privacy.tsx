import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Lock, Eye, FileText, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — GitBowl" },
      {
        name: "description",
        content:
          "Read the GitBowl Privacy Policy. Learn how we collect, store, and protect your source code, account data, and git repositories.",
      },
      { property: "og:title", content: "Privacy Policy — GitBowl" },
      {
        property: "og:description",
        content:
          "Learn how GitBowl collects, stores, and protects your code, commits, and personal information.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const lastUpdated = "October 1, 2026";

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between">
      <Header />

      <main className="mx-auto w-full max-w-4xl px-4 py-12 flex-1">
        {/* Navigation Breadcrumb */}
        <div className="mb-6">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-muted-foreground"
          >
            <Link to="/">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to GitBowl
            </Link>
          </Button>
        </div>

        {/* Page Header */}
        <div className="border-b border-border pb-8 mb-8">
          <div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-wider mb-2">
            <ShieldCheck className="h-4 w-4" /> Legal & Transparency
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Effective date & last updated:{" "}
            <span className="font-medium text-foreground">{lastUpdated}</span>
          </p>
        </div>

        {/* Document Content */}
        <div className="prose prose-sm dark:prose-invert max-w-none space-y-8 text-foreground leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight border-b border-border/60 pb-2">
              1. Overview & Commitment
            </h2>
            <p className="text-muted-foreground text-sm">
              GitBowl (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) operates the Git
              repository hosting platform, smart-HTTP Git engine, web code editor, and developer
              services available at gitbowl.zone.id. We respect your privacy and are committed to
              safeguarding your personal data, developer credentials, and proprietary code.
            </p>
            <p className="text-muted-foreground text-sm">
              This Privacy Policy explains what information we collect when you visit GitBowl,
              authenticate with Google, clone or push Git repositories, and interact with our web
              services.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight border-b border-border/60 pb-2">
              2. Information We Collect
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-card p-4 space-y-1.5">
                <h3 className="font-semibold text-sm flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> Google & Firebase Authentication
                </h3>
                <p className="text-xs text-muted-foreground">
                  When you sign in via Google Authentication, Firebase provides your email address,
                  verified display name, and public profile avatar. We never receive or store your
                  Google account password.
                </p>
              </div>

              <div className="rounded-lg border border-border bg-card p-4 space-y-1.5">
                <h3 className="font-semibold text-sm flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> Repository Data & Commits
                </h3>
                <p className="text-xs text-muted-foreground">
                  Source code files, commit trees, commit messages, author signatures (name and
                  email configured in git), branches, issues, comments, and project settings.
                </p>
              </div>

              <div className="rounded-lg border border-border bg-card p-4 space-y-1.5">
                <h3 className="font-semibold text-sm flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> Developer Credentials & Tokens
                </h3>
                <p className="text-xs text-muted-foreground">
                  Personal Access Tokens (PATs) generated for Git CLI access. We store only
                  cryptographic SHA-256 hashes of your tokens; raw tokens cannot be retrieved once
                  created.
                </p>
              </div>

              <div className="rounded-lg border border-border bg-card p-4 space-y-1.5">
                <h3 className="font-semibold text-sm flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> Operational Logs & Network
                  Metrics
                </h3>
                <p className="text-xs text-muted-foreground">
                  Client IP addresses, Git user-agent headers, timestamped API requests,
                  rate-limiting tokens, and HTTP status codes used to maintain network integrity and
                  prevent abuse.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight border-b border-border/60 pb-2">
              3. Public vs. Private Repositories
            </h2>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">Public Repositories:</strong> Any content,
                source code, commits, or issues in a public repository are visible to the world.
                Anyone on the Internet can view, clone, and read public repositories. Do not include
                unencrypted API keys, secrets, private certificates, or proprietary data in public
                repositories.
              </p>
              <p>
                <strong className="text-foreground">Private Repositories:</strong> Private
                repositories are restricted. Access is granted solely to the authenticated owner and
                explicitly invited collaborators. Our employees and automated systems do not inspect
                your private code except where required by law, to prevent security incidents, or
                with your explicit consent for technical support.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight border-b border-border/60 pb-2">
              4. Service Infrastructure & Subprocessors
            </h2>
            <p className="text-sm text-muted-foreground">
              GitBowl utilizes industry-leading infrastructure providers to ensure high
              availability, data redundancy, and security:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-muted-foreground">
              <li>
                <strong className="text-foreground">Google Firebase:</strong> Identity management,
                Google OAuth token verification, and analytics measurement.
              </li>
              <li>
                <strong className="text-foreground">Supabase & PostgreSQL:</strong> Git repository
                file storage, database schemas, Row Level Security (RLS), and transactions.
              </li>
              <li>
                <strong className="text-foreground">Cloudflare & Google Cloud:</strong> CDN edge
                delivery, DDoS prevention, SSL/TLS encryption, and container execution.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight border-b border-border/60 pb-2">
              5. Data Protection & Security Controls
            </h2>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                All communications between your browser or Git CLI and GitBowl are encrypted in
                transit using Transport Layer Security (TLS 1.3). Database tables enforce PostgreSQL
                Row Level Security to isolate repositories by user tenancy.
              </p>
              <p>
                Authentication credentials, personal access tokens, and sessions are hashed with
                irreversible algorithms (SHA-256/bcrypt). We conduct regular automated vulnerability
                reviews and continuous integration testing.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight border-b border-border/60 pb-2">
              6. Your Rights & Data Portability (GDPR & CCPA)
            </h2>
            <p className="text-sm text-muted-foreground">
              Regardless of your physical location, GitBowl provides comprehensive data ownership
              rights:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-muted-foreground">
              <li>
                <strong className="text-foreground">Access & Export:</strong> You can download any
                repository as a full .zip archive or clone the full Git commit history at any time.
              </li>
              <li>
                <strong className="text-foreground">Rectification:</strong> You can edit your
                profile username, display name, and repository settings directly in the app.
              </li>
              <li>
                <strong className="text-foreground">Deletion:</strong> Deleting a repository
                permanently removes all associated files, commit rows, and metadata. You may also
                request full account erasure.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight border-b border-border/60 pb-2">
              7. Contact Us
            </h2>
            <p className="text-sm text-muted-foreground">
              If you have any questions, concerns, or requests regarding this Privacy Policy or your
              data on GitBowl, please contact our privacy team at{" "}
              <a
                href="mailto:support@gitbowl.zone.id"
                className="text-primary font-medium underline"
              >
                support@gitbowl.zone.id
              </a>
              .
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
