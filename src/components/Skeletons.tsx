export function RepoCardSkeleton() {
  return (
    <div className="panel flex flex-col justify-between p-4 animate-pulse">
      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-muted" />
          <div className="h-4 w-32 rounded bg-muted" />
        </div>
        <div className="h-3 w-48 rounded bg-muted/60" />
      </div>
      <div className="mt-4 flex items-center gap-4">
        <div className="h-3 w-16 rounded bg-muted/60" />
        <div className="h-3 w-12 rounded bg-muted/60" />
      </div>
    </div>
  );
}

export function FeedItemSkeleton() {
  return (
    <div className="flex items-start gap-3 border-b border-border/50 py-3.5 animate-pulse">
      <div className="h-8 w-8 rounded-full bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-3/4 rounded bg-muted" />
        <div className="h-3 w-1/3 rounded bg-muted/60" />
      </div>
    </div>
  );
}

export function TableRowSkeleton() {
  return (
    <div className="flex items-center justify-between border-b border-border/50 px-4 py-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-4 w-4 rounded bg-muted" />
        <div className="h-4 w-40 rounded bg-muted" />
      </div>
      <div className="h-3.5 w-24 rounded bg-muted/60" />
    </div>
  );
}
