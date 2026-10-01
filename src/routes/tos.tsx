import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, ShieldAlert, Scale, ArrowLeft, Terminal, AlertTriangle } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/tos")({
  head: () => ({
    meta: [
      { title: "Terms of Service — GitBowl" },
      {
        name: "description",
        content:
          "Read the GitBowl Terms of Service. Understand your rights, acceptable use policy, repository hosting terms, and developer responsibilities.",
      },
      { property: "og:title", content: "Terms of Service — GitBowl" },
      {
        property: "og:description",
        content:
          "Official Terms of Service for GitBowl Git repository hosting and developer platform.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
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
            <Scale className="h-4 w-4" /> Legal Terms & Conditions
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Terms of Service
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Last modified: <span className="font-medium text-foreground">{lastUpdated}</span>
          </p>
        </div>

        {/* Document Content */}
        <div className="prose prose-sm dark:prose-invert max-w-none space-y-8 text-foreground leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight border-b border-border/60 pb-2">
              1. Acceptance of Terms
            </h2>
            <p className="text-muted-foreground text-sm">
              By accessing, browsing, registering for an account, or using any Git command
              (including git clone, git fetch, and git push) with GitBowl, you agree to be bound by
              these Terms of Service (&quot;Terms&quot;) and our Privacy Policy. If you do not agree
              to these Terms, you may not use GitBowl services.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight border-b border-border/60 pb-2">
              2. Authentication & Account Security
            </h2>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">Google Authentication:</strong> You may
                authenticate using your verified Google account through Firebase Authentication. You
                agree to provide accurate and complete registration details.
              </p>
              <p>
                <strong className="text-foreground">Personal Access Tokens & Credentials:</strong>{" "}
                You are responsible for maintaining the confidentiality of your Personal Access
                Tokens (PATs) and passwords used for Git CLI operations. Any action taken using your
                tokens will be attributed to your account. Notify us immediately if you suspect
                unauthorized use.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight border-b border-border/60 pb-2">
              3. Ownership of Code & Intellectual Property
            </h2>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">You Own Your Code:</strong> We claim no
                intellectual property rights over the software, code, files, images, or
                documentation that you upload or push to GitBowl. What you create remains entirely
                yours.
              </p>
              <p>
                <strong className="text-foreground">Public Repositories & Open Source:</strong> By
                setting a repository to public, you grant other GitBowl users and the public the
                right to view, clone, and fork your repository according to the software license you
                select (e.g., MIT, Apache 2.0, GPL).
              </p>
              <p>
                <strong className="text-foreground">Service License:</strong> You grant GitBowl the
                limited technical license necessary to host, index, display, store, cache, and
                transmit your repositories solely for the purpose of operating the platform.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight border-b border-border/60 pb-2">
              4. Acceptable Use Policy
            </h2>
            <p className="text-sm text-muted-foreground">
              You agree not to misuse the GitBowl platform. Prohibited activities include, but are
              not limited to:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-muted-foreground">
              <li>
                Distributing malicious software, trojans, ransomware, or exploits intended to harm
                computer systems.
              </li>
              <li>
                Hosting or distributing stolen intellectual property, unauthorized copyrighted
                materials, or trade secrets.
              </li>
              <li>
                Performing denial-of-service (DoS) attacks, automated crawler abuse, or bypassing
                Git protocol rate limits.
              </li>
              <li>
                Using repositories purely for illegal cryptocurrency mining, automated scraping, or
                bulk spam delivery.
              </li>
              <li>Impersonating another developer, company, or open source maintainer.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight border-b border-border/60 pb-2">
              5. Smart-HTTP Git Protocol & Operational Limits
            </h2>
            <p className="text-sm text-muted-foreground">
              To guarantee consistent performance and protect system availability for all
              developers, GitBowl enforces reasonable operational constraints:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-muted-foreground">
              <li>
                <strong className="text-foreground">Rate Limits:</strong> Maximum 90 Git read
                requests (info/refs, upload-pack) and 30 push operations per minute per IP.
              </li>
              <li>
                <strong className="text-foreground">File Size Limits:</strong> Individual binary
                files should not exceed reasonable limits without object storage flags.
              </li>
              <li>
                <strong className="text-foreground">Branch Integrity:</strong> Deleting the default
                branch over Git protocol is restricted to protect project history.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight border-b border-border/60 pb-2">
              6. Service Availability & Modification
            </h2>
            <p className="text-sm text-muted-foreground">
              We strive for 99.9% uptime, but the service is provided on an &quot;AS IS&quot; and
              &quot;AS AVAILABLE&quot; basis. We reserve the right to modify, suspend, or
              discontinue any feature, endpoint, or service with or without prior notice. We
              encourage you to maintain offsite backups of your repositories.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight border-b border-border/60 pb-2">
              7. Disclaimer of Warranties & Limitation of Liability
            </h2>
            <div className="rounded-lg border border-border bg-card p-4 space-y-2 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground uppercase tracking-wide">
                Limitation of Liability
              </p>
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, GITBOWL, ITS FOUNDERS, AND
                CONTRIBUTORS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
                CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, USE, GOODWILL, OR
                CODE RECOVERY COSTS RESULTING FROM YOUR ACCESS TO OR INABILITY TO ACCESS THE
                SERVICE.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight border-b border-border/60 pb-2">
              8. Contact & Legal Notices
            </h2>
            <p className="text-sm text-muted-foreground">
              For DMCA copyright notifications, trademark inquiries, or general legal questions,
              please contact us at:{" "}
              <a href="mailto:legal@gitbowl.zone.id" className="text-primary font-medium underline">
                legal@gitbowl.zone.id
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
