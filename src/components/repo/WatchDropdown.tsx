import { useState, useEffect } from "react";
import { Eye, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

interface WatchDropdownProps {
  repoId: string;
}

type WatchMode = "all" | "participating" | "ignore";

export function WatchDropdown({ repoId }: WatchDropdownProps) {
  const { user } = useAuth();
  const [mode, setMode] = useState<WatchMode>("participating");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`gitbowl_watch_${repoId}`) as WatchMode;
      if (saved) setMode(saved);
    }
  }, [repoId]);

  function handleSelect(newMode: WatchMode) {
    if (!user) {
      toast.error("Sign in to watch this repository");
      return;
    }
    setMode(newMode);
    if (typeof window !== "undefined") {
      localStorage.setItem(`gitbowl_watch_${repoId}`, newMode);
    }
    toast.success(
      newMode === "all"
        ? "Watching all activity on this repository"
        : newMode === "ignore"
        ? "Ignoring notifications for this repository"
        : "Watching mentions & participating conversations",
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs border-white/[0.1] bg-black text-zinc-200 hover:text-white hover:border-white/20"
        >
          <Eye className="h-3.5 w-3.5 text-zinc-400" />
          <span>{mode === "all" ? "Unwatch" : "Watch"}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 bg-zinc-950 border border-white/[0.12] text-white p-1.5 space-y-1">
        <DropdownMenuItem
          onClick={() => handleSelect("participating")}
          className="flex items-start gap-2.5 p-2 rounded-lg cursor-pointer hover:bg-white/[0.06]"
        >
          {mode === "participating" ? (
            <Check className="h-4 w-4 text-white mt-0.5 shrink-0" />
          ) : (
            <div className="w-4 shrink-0" />
          )}
          <div>
            <p className="text-xs font-semibold text-white">Participating and @mentions</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Only receive notifications when mentioned or participating.
            </p>
          </div>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => handleSelect("all")}
          className="flex items-start gap-2.5 p-2 rounded-lg cursor-pointer hover:bg-white/[0.06]"
        >
          {mode === "all" ? (
            <Check className="h-4 w-4 text-white mt-0.5 shrink-0" />
          ) : (
            <div className="w-4 shrink-0" />
          )}
          <div>
            <p className="text-xs font-semibold text-white">All Activity</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Notified of all commits, pull requests, and discussions.
            </p>
          </div>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => handleSelect("ignore")}
          className="flex items-start gap-2.5 p-2 rounded-lg cursor-pointer hover:bg-white/[0.06]"
        >
          {mode === "ignore" ? (
            <Check className="h-4 w-4 text-white mt-0.5 shrink-0" />
          ) : (
            <div className="w-4 shrink-0" />
          )}
          <div>
            <p className="text-xs font-semibold text-white">Ignore</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Never be notified about activity in this repository.
            </p>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
