import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { vsStatus, type VsStatus } from "@/lib/tauri";
import { useAppSettings } from "@/state/AppState";

const POLL_MS = 100;

function fmtBytes(n: number): string {
  if (!n || n <= 0) return "0 MB";
  const mb = n / (1024 * 1024);
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function Item({ label, value, title }: { label: string; value: ReactNode; title?: string }) {
  return (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap" title={title}>
      <span className="uppercase tracking-wider text-muted-foreground/60">{label}</span>
      <span className="font-mono text-foreground/80">{value}</span>
    </div>
  );
}

export function StatusBar({ className }: { className?: string }) {
  const { buildInfo } = useAppSettings();
  const [st, setSt] = useState<VsStatus | null>(null);
  const [err, setErr] = useState(false);
  const pending = useRef(false);

  useEffect(() => {
    let stale = false;
    const tick = () => {
      if (pending.current) return;
      pending.current = true;
      vsStatus()
        .then((s) => {
          if (stale) return;
          setSt(s);
          setErr(false);
        })
        .catch(() => {
          if (!stale) setErr(true);
        })
        .finally(() => {
          pending.current = false;
        });
    };
    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      stale = true;
      window.clearInterval(id);
    };
  }, []);

  const hasCache = !!st?.coreAlive && st.cacheMax > 0;
  const cachePct = hasCache ? Math.min(100, (st!.cacheUsed / st!.cacheMax) * 100) : 0;
  const memPct = st && st.memMax > 0 ? Math.min(100, (st.memUsed / st.memMax) * 100) : 0;
  const state = err
    ? "Error"
    : st?.state === "Rendering"
      ? `Processing (${st.active})`
      : (st?.state ?? "Idle");
  const decoderValue = st?.decoder
    ? `${st.decoder}${buildInfo ? ` ${buildInfo.bestsource}` : ""}`
    : "-";
  const dotClass = err
    ? "bg-destructive"
    : st?.state === "Rendering"
      ? "bg-primary"
      : st?.state === "Not found"
        ? "bg-destructive"
        : st?.coreAlive
          ? "bg-emerald-500"
          : "bg-muted-foreground";

  return (
    <div
      className={cn(
        "flex h-6 shrink-0 select-none items-center gap-3 border-t border-border bg-panel px-3 text-[11px] text-muted-foreground",
        err && "opacity-60",
        className,
      )}
    >
      <div
        className="flex items-center gap-1.5 whitespace-nowrap"
        title={
          err
            ? "The last status poll failed - shown values are stale"
            : st?.coreAlive
              ? "A filter graph is built and holding memory"
              : "No live core (built on demand)"
        }
      >
        <span
          className={cn(
            "size-2 rounded-full",
            dotClass,
            !err && st?.state === "Rendering" && "animate-pulse",
          )}
        />
        <span className="text-foreground/80">{state}</span>
      </div>

      <Item label="VapourSynth" value={buildInfo?.vapoursynth ?? "-"} />

      <Item
        label="Hardware Device"
        value={st?.hwdevice ?? "-"}
        title="Hardware decode device (CPU = software)"
      />

      <Item label="Decoder" value={decoderValue} title="Source decoder" />

      <Item label="Threads" value={st?.threads || "-"} title="VapourSynth worker threads" />

      <div
        className="ml-auto flex items-center gap-1.5 whitespace-nowrap"
        title="VapourSynth frame (framebuffer) cache: memory currently held vs the cap before it is reclaimed"
      >
        <span className="uppercase tracking-wider text-muted-foreground/60">Framebuffer</span>
        {hasCache ? (
          <>
            <span className="font-mono text-foreground/80">{fmtBytes(st!.cacheUsed)}</span>
            <span className="block h-1.5 w-16 overflow-hidden bg-muted">
              <span
                className="block h-full bg-primary/70 transition-[width] duration-500"
                style={{ width: `${cachePct}%` }}
              />
            </span>
          </>
        ) : (
          <span className="font-mono text-foreground/80">-</span>
        )}
      </div>

      <div
        className="flex items-center gap-1.5 whitespace-nowrap"
        title="Raw-frame transport staging: RGBA bytes held for the current preview render (superseded renders are freed)"
      >
        <span className="uppercase tracking-wider text-muted-foreground/60">Memory</span>
        <span className="font-mono text-foreground/80">{st ? fmtBytes(st.memUsed) : "-"}</span>
        <span className="block h-1.5 w-16 overflow-hidden bg-muted">
          <span
            className="block h-full bg-primary/70 transition-[width] duration-500"
            style={{ width: `${memPct}%` }}
          />
        </span>
      </div>
    </div>
  );
}
