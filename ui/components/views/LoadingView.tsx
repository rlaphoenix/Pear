import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const FADE_MS = 1000;

interface Props {
  initializing: boolean;
  indexing: { name: string | null; percent: number | null; current: number; total: number };
  detail?: string | null;
}

export function LoadingView({ initializing, indexing, detail }: Props) {
  const pct =
    typeof indexing.percent === "number" ? Math.max(0, Math.min(100, indexing.percent)) : null;
  const active = initializing || pct !== null;

  const [rendered, setRendered] = useState(active);
  useEffect(() => {
    if (active) {
      setRendered(true);
      return;
    }
    const t = window.setTimeout(() => setRendered(false), FADE_MS);
    return () => window.clearTimeout(t);
  }, [active]);

  const shown = useRef({ pct, indexing, detail });
  useEffect(() => {
    if (active) shown.current = { pct, indexing, detail };
  });
  const s = active ? { pct, indexing, detail } : shown.current;

  if (!active && !rendered) return null;

  return (
    <div
      aria-live="polite"
      className={cn(
        "absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-background",
        "transition-opacity duration-1000 ease-out",
        active ? "opacity-100" : "opacity-0 pointer-events-none",
      )}
    >
      {s.pct !== null ? (
        <div className="flex w-max min-w-96 max-w-[90%] flex-col gap-1.5">
          <div className="mb-1.5 text-center text-base font-semibold text-foreground/90">
            Indexing ({s.indexing.current}/{s.indexing.total})
          </div>
          <div className="flex items-baseline justify-between gap-8 text-xs text-foreground/80">
            <span className="truncate">{s.indexing.name}</span>
            <span className="shrink-0 tabular-nums">{Math.round(s.pct)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-200"
              style={{ width: `${s.pct}%` }}
            />
          </div>
          <div className="text-xs leading-relaxed text-foreground/70">
            Building the frame index - the first load of a file can take a while.
          </div>
        </div>
      ) : (
        <>
          <Loader2 className="size-7 animate-spin text-primary" />
          <div className="text-center text-sm text-foreground/80">{s.detail ?? "Preparing sources…"}</div>
          <div className="text-center text-xs text-foreground/60">
            Analyzing and indexing your sources.
          </div>
        </>
      )}
    </div>
  );
}
