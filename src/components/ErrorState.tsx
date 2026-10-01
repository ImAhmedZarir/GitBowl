import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  homeLink?: boolean;
}

export function ErrorState({
  title = "Something went wrong",
  message = "An unexpected error occurred while loading this view. You can try refreshing or returning home.",
  onRetry,
  homeLink = true,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/20 bg-destructive/5 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-foreground tracking-tight">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{message}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" /> Try again
          </Button>
        )}
        {homeLink && (
          <Button asChild size="sm">
            <a href="/" className="gap-2">
              <Home className="h-3.5 w-3.5" /> Go home
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
