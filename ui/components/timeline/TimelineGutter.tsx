import { cn } from "@/lib/utils";
import type { UiSource } from "@/state/AppState";
import { LANE_H, RULER_H, trackLabel } from "@/lib/timeline";

interface GutterProps {
  sources: UiSource[];
  labels: string[];
  gutterW: number;
  labelRef: React.MutableRefObject<HTMLSpanElement | null>;
  abRef: React.MutableRefObject<HTMLSpanElement | null>;
  onResize: (e: React.PointerEvent) => void;
}

export function TimelineGutter({
  sources,
  labels,
  gutterW,
  labelRef,
  abRef,
  onResize,
}: GutterProps) {
  return (
    <div className="relative shrink-0 border-r border-border" style={{ width: gutterW }}>
      <div style={{ height: RULER_H }} className="border-b border-border/60" />

      {sources.map((source, idx) => {
        const hasLabel = !!trackLabel(source);
        const label = labels[idx];
        const tag = String.fromCharCode(65 + idx);
        return (
          <div
            key={source.id}
            style={{ height: LANE_H }}
            className="flex items-center gap-2 border-b border-border/60 pl-2 pr-[18px]"
          >
            <span
              ref={idx === 0 ? abRef : undefined}
              className="font-mono text-[11px] font-semibold text-foreground/80"
            >
              {tag}
            </span>
            <span
              ref={idx === 0 ? labelRef : undefined}
              className={cn(
                "min-w-0 flex-1 truncate text-[11px]",
                hasLabel ? "text-foreground/70" : "text-muted-foreground/40",
              )}
              title={hasLabel ? label : undefined}
            >
              {label}
            </span>
          </div>
        );
      })}

      <div
        className="absolute top-0 right-1 z-30 w-1.5 cursor-col-resize bg-primary/25 transition-colors hover:bg-primary/60"
        style={{ height: RULER_H + LANE_H * sources.length }}
        onPointerDown={onResize}
        title="Drag to resize the track name area"
      />
    </div>
  );
}
