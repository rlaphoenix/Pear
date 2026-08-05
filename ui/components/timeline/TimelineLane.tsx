import { cn } from "@/lib/utils";
import type { GenParams } from "@/lib/tauri";
import type { UiSource } from "@/state/AppState";
import { HANDLE, LANE_H } from "@/lib/timeline";
import type { Menu, Sel, Tool } from "@/lib/timeline";
import { SegThumb } from "./TimelineThumbnail";
import type { TimelineViewport } from "@/hooks/useTimelineViewport";
import type { TimelineEditing } from "@/hooks/useTimelineEditing";

interface LaneProps {
  source: UiSource;
  idx: number;
  params: GenParams;
  paramsKey: string;
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

export function TimelineLane({
  source,
  idx,
  params,
  paramsKey,
  tool,
  sel,
  setSel,
  setMenu,
  renaming,
  setRenaming,
  onSelectSource,
  view,
  edit,
}: LaneProps) {
  const { xOf, pxPerFrame, rawFrameAtX } = view;
  const { razorAt, startDrag, setName } = edit;
  const id = source.id;
  const segs = source.segments;
  return (
    <div
      className="relative border-b border-border/60 bg-[#0c0c0f]"
      style={{ height: LANE_H }}
      onPointerDown={() => setSel(null)}
    >
      {segs.map((s, i) => {
        const selected = sel?.id === id && sel.index === i;
        return (
          <div
            key={s.id}
            className={cn(
              "absolute inset-y-0 overflow-hidden border bg-[#1b2a3a] select-none",
              selected ? "border-primary ring-1 ring-primary" : "border-[#2c4055]",
              tool === "razor" ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing",
            )}
            style={{ left: xOf(s.pos), width: Math.max(2, s.len * pxPerFrame) }}
            onPointerDown={(e) => {
              onSelectSource(idx);
              if (tool === "razor") {
                e.stopPropagation();
                razorAt(id, rawFrameAtX(e.clientX));
              } else {
                startDrag(e, "move", id, i);
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSel({ id, index: i });
              setMenu({ x: e.clientX, y: e.clientY, id, index: i });
            }}
          >
            {source.path && (
              <SegThumb params={params} paramsKey={paramsKey} source={idx} frame={s.src} />
            )}
            {s.name && (
              <span className="pointer-events-none absolute top-0.5 left-1 z-10 max-w-[calc(100%-8px)] truncate font-medium text-[10px] leading-none text-white [text-shadow:0_1px_2px_#000]">
                {s.name}
              </span>
            )}
            <span className="pointer-events-none absolute bottom-0.5 left-1 z-10 font-mono text-[9px] leading-none text-white/80 [text-shadow:0_1px_2px_#000]">
              {s.src}–{s.src + s.len - 1}
            </span>
            {renaming?.id === id && renaming.index === i && (
              <input
                autoFocus
                defaultValue={s.name ?? ""}
                aria-label="Clip name"
                placeholder="Clip name"
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setName(id, i, (e.target as HTMLInputElement).value.trim());
                    setRenaming(null);
                  } else if (e.key === "Escape") {
                    setRenaming(null);
                  }
                  e.stopPropagation();
                }}
                onBlur={(e) => {
                  setName(id, i, e.target.value.trim());
                  setRenaming(null);
                }}
                className="absolute inset-x-1 top-1/2 z-30 -translate-y-1/2 border border-primary bg-[#0d0d10] px-1 py-0.5 text-[11px] text-foreground outline-none"
              />
            )}
            {tool === "select" && (
              <>
                <div
                  className="absolute inset-y-0 left-0 z-20 cursor-ew-resize bg-primary/0 hover:bg-primary/40"
                  style={{ width: HANDLE }}
                  onPointerDown={(e) => startDrag(e, "trimL", id, i)}
                />
                <div
                  className="absolute inset-y-0 right-0 z-20 cursor-ew-resize bg-primary/0 hover:bg-primary/40"
                  style={{ width: HANDLE }}
                  onPointerDown={(e) => startDrag(e, "trimR", id, i)}
                />
              </>
            )}
          </div>
        );
      })}
      {segs.length === 0 && (
        <div className="pointer-events-none flex h-full items-center whitespace-nowrap pl-3 text-[11px] text-muted-foreground/50">
          {!source.path
            ? "No source - open the cog to choose a file."
            : source.error
              ? "Source failed to load."
              : source.indexProgress != null
                ? `Indexing ${source.indexProgress}%`
                : source.vsprobing
                  ? "Loading source..."
                  : "No frames in range."}
        </div>
      )}
    </div>
  );
}
