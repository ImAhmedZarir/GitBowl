import { Link } from "@tanstack/react-router";
import { BowlLogo } from "@/components/BowlLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Heart, Terminal } from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-card/60 py-8 text-xs text-muted-foreground transition-colors">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 md:flex-row">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-2 font-medium text-foreground transition-opacity hover:opacity-90"
          >
            <BowlLogo className="h-4 w-4" />
            <span>GitBowl</span>
          </Link>
          <span className="text-border">|</span>
          <span className="text-muted-foreground">
            &copy; {new Date().getFullYear()} GitBowl. Your code, in a bowl.
          </span>
        </div>

        <nav
          aria-label="Footer links"
          className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-center"
        >
          <Link to="/explore" className="text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap">
            Explore
          </Link>
          <a
            href="https://gitbowl.zone.id"
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
          >
            Status
          </a>
          <Link
            to="/docs"
            className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 whitespace-nowrap"
          >
            <Terminal className="h-3 w-3" /> Docs
          </Link>
          <Link to="/tos" className="text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap">
            Terms
          </Link>
          <Link to="/privacy" className="text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap">
            Privacy
          </Link>
          <a
            href="mailto:mail.gitbowl@gmail.com"
            className="text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
          >
            Contact
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
            All systems operational
          </span>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
