import { Link } from "@tanstack/react-router";
import { BowlLogo } from "@/components/BowlLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Heart, Terminal } from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-card/40 py-8 text-xs text-muted-foreground transition-colors">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 md:flex-row">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-2 font-medium text-foreground transition-colors hover:text-primary"
          >
            <BowlLogo className="h-4 w-4" />
            <span>GitBowl</span>
          </Link>
          <span className="text-border">|</span>
          <span className="text-muted-foreground">
            &copy; {new Date().getFullYear()} GitBowl. Your code, in a bowl.
          </span>
        </div>

        <nav aria-label="Footer links" className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link to="/explore" className="hover:text-foreground transition-colors">
            Explore
          </Link>
          <a
            href="https://gitbowl.zone.id"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground transition-colors"
          >
            Status
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            <Terminal className="h-3 w-3" /> CLI Docs
          </a>
          <a href="#" className="hover:text-foreground transition-colors">
            Terms
          </a>
          <a href="#" className="hover:text-foreground transition-colors">
            Privacy
          </a>
          <a href="#" className="hover:text-foreground transition-colors">
            Contact
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
            All systems normal
          </span>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
