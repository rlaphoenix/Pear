import { ArrowUpCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type UpdateState = "checking" | "available" | "hidden";

export function UpdateChecker({
  state,
  version,
  onOpen,
}: {
  state: UpdateState;
  version?: string;
  onOpen: () => void;
}) {
  if (state === "hidden") return null;

  if (state === "checking") {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-border/70 bg-white/[0.02] px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Checking for updates
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      title={version ? `Pear ${version} is available - open the release` : "Open the release"}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium outline-none transition-colors",
        "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:border-emerald-500/60 hover:bg-emerald-500/15",
      )}
    >
      <ArrowUpCircle className="size-3.5" />
      Update available
    </button>
  );
}
