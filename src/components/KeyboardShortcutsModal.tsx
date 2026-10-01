import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface KeyboardShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardShortcutsModal({ open, onOpenChange }: KeyboardShortcutsModalProps) {
  const shortcuts = [
    {
      group: "Navigation & Global",
      items: [
        { keys: ["/"], label: "Focus search" },
        { keys: ["⌘", "K"], label: "Command palette" },
        { keys: ["?"], label: "Show keyboard shortcuts" },
      ],
    },
    {
      group: "Repository shortcuts",
      items: [
        { keys: ["g", "c"], label: "Go to Code" },
        { keys: ["g", "i"], label: "Go to Issues" },
        { keys: ["g", "p"], label: "Go to Pull requests" },
        { keys: ["t"], label: "Activate file finder" },
        { keys: ["b"], label: "Switch branch or tag" },
        { keys: ["."], label: "Open web code editor" },
      ],
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Keyboard shortcuts</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Navigate GitBowl with precision using single-key and modifier shortcuts.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-5">
          {shortcuts.map((section) => (
            <div key={section.group}>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {section.group}
              </h4>
              <div className="mt-2 divide-y divide-border/40 rounded-lg border border-border/60 bg-card/60">
                {section.items.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between px-3 py-2 text-xs"
                  >
                    <span className="text-foreground">{item.label}</span>
                    <div className="flex items-center gap-1">
                      {item.keys.map((k) => (
                        <kbd
                          key={k}
                          className="min-w-5 rounded border border-border/80 bg-muted/80 px-1.5 py-0.5 text-center font-mono text-[11px] font-medium text-foreground shadow-xs"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
