import { useState } from "react";
import { cn } from "@/lib/utils";
import type { GenParams } from "@/lib/tauri";
import type { UiSource } from "@/state/AppState";
import { GUIDE_PREVIEW_W, LANE_H, RULER_H } from "@/lib/timeline";
import type { Menu, Sel, Tool } from "@/lib/timeline";
import { GuidePreview } from "./TimelineGuide";
import { TimelineLane } from "./TimelineLane";
import type { TimelineViewport } from "@/hooks/useTimelineViewport";
import type { TimelineEditing } from "@/hooks/useTimelineEditing";

interface TracksProps {
  sources: UiSource[];
  params: GenParams;
  paramsKey: string;
  base: number;
  tool: Tool;
  sel: Sel | null;
  setSel: (s: Sel | null) => void;
  setMenu: (m: Menu | null) => void;
  renaming: Sel | null;
  setRenaming: (s: Sel | null) => void;
  onSelectSource: (i: number) => void;
  view: TimelineViewport;
  edit: TimelineEditing;
}

export function TimelineTracks({
  sources,
  params,
  paramsKey,
  base,
  tool,
  sel,
  setSel,
  setMenu,
  renaming,
  setRenaming,
  onSelectSource,
  view,
  edit,
}: TracksProps) {
  const {
    scrollRef,
    setScrollLeft,
    scrollW,
    ticks,
    xOf,
    fmt,
    rawFrameAtX,
    startScrub,
    viewW,
    scrollLeft,
  } = view;
  const [hover, setHover] = useState<{ frame: number; overRuler: boolean } | null>(null);

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
      className="relative min-w-0 flex-1 overflow-x-scroll [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div
        style={{ width: scrollW }}
        className="relative"
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const overRuler = e.clientY - rect.top < RULER_H;
          if (overRuler || tool === "razor") {
            setHover({ frame: rawFrameAtX(e.clientX), overRuler });
          } else {
            setHover(null);
          }
        }}
        onPointerLeave={() => setHover(null)}
      >
        <div
          className="relative cursor-text border-b border-border/60 bg-[#0e0e12]"
          style={{ height: RULER_H }}
          onPointerDown={startScrub}
        >
          {ticks.map((f) => (
            <div
              key={f}
              className={cn(
                "absolute top-0 flex h-full items-center border-l pl-1 font-mono text-[9px]",
                f === 0
                  ? "border-primary/70 text-foreground/70"
                  : "border-border/50 text-muted-foreground/60",
              )}
              style={{ left: xOf(f) }}
            >
              {fmt(f)}
            </div>
          ))}
        </div>

        {sources.map((source, idx) => (
          <div key={source.id}>
            <TimelineLane
              source={source}
              idx={idx}
              params={params}
              paramsKey={paramsKey}
              tool={tool}
              sel={sel}
              setSel={setSel}
              setMenu={setMenu}
              renaming={renaming}
              setRenaming={setRenaming}
              onSelectSource={onSelectSource}
              view={view}
              edit={edit}
            />
          </div>
        ))}

        {hover &&
          (() => {
            const t = hover.frame;
            const lineX = xOf(t);
            const lineTop = hover.overRuler ? 0 : RULER_H;
            const lineHeight =
              (hover.overRuler ? RULER_H : 0) + LANE_H * sources.length;
            const lineColor = tool === "razor" ? "bg-red-400" : "bg-gray-400";
            const fitsRight = lineX + 1 + GUIDE_PREVIEW_W <= scrollLeft + viewW;
            return (
              <>
                <div
                  className={cn("pointer-events-none absolute z-40 w-px", lineColor)}
                  style={{ left: lineX, top: lineTop, height: lineHeight }}
                />
                {sources.map((source, idx) => {
                  if (!source.path) return null;
                  const seg = source.segments.find((s) => t > s.pos && t < s.pos + s.len);
                  if (!seg) return null;
                  const srcFrame = seg.src + (t - seg.pos);
                  const top = RULER_H + idx * LANE_H;
                  const style: React.CSSProperties = fitsRight
                    ? { left: lineX + 1, top }
                    : { right: scrollW - lineX, top };
                  return (
                    <GuidePreview
                      key={source.id}
                      params={params}
                      paramsKey={paramsKey}
                      source={idx}
                      frame={srcFrame}
                      height={LANE_H}
                      style={style}
                    />
                  );
                })}
              </>
            );
          })()}

        <div
          className="pointer-events-none absolute top-0 z-30 w-px bg-primary"
          style={{ left: xOf(base), height: RULER_H + LANE_H * sources.length }}
        >
          <div className="absolute -left-[3px] top-0 size-0 border-x-[3px] border-t-[5px] border-x-transparent border-t-primary" />
        </div>
      </div>
    </div>
  );
}
