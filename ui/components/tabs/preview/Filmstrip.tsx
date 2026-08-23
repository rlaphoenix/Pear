import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SourceBadge } from "@/components/SourceBadge";
import { render, nextRenderSeq, type GenParams, type ProjectFrame, type DataUrl } from "@/lib/tauri";

interface Props {
  base: number;
  maxBase: number;
  aspect: number;
  sourceCount: number;
  activeSource: number;
  params: GenParams;
  paramsKey: string;
  ready: boolean;
  active: boolean;
  setBase: (base: number) => void;
  onSelectSource: (index: number) => void;
  className?: string;
}

const COLLAPSED_H = 1;
const MIN_BOX_H = 18;
const CAP_BOX_H = 220;
const DEFAULT_BOX_H = 76;
const PAD_X = 24;
const GAP = 4;
const ROW_PAD_Y = 16;
const LABEL_W = 16;
const THUMB_WIDTH = 240;

type Thumbs = Record<number, Record<ProjectFrame, DataUrl>>;
const EMPTY_THUMBS: Thumbs = {};

export function Filmstrip({
  base,
  maxBase,
  aspect,
  sourceCount,
  activeSource,
  params,
  paramsKey,
  ready,
  active,
  setBase,
  onSelectSource,
  className,
}: Props) {
  const rows = Math.max(1, sourceCount);
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(() => DEFAULT_BOX_H + ROW_PAD_Y);
  const drag = useRef({ startY: 0, startH: 0, active: false, moved: false });
  const customized = useRef(false);
  const clampFrame = (v: number) => Math.max(0, Math.min(maxBase, v));

  const [thumbCache, setThumbCache] = useState<{ key: string; frames: Thumbs }>(() => ({
    key: paramsKey,
    frames: {},
  }));
  const thumbs = thumbCache.key === paramsKey ? thumbCache.frames : EMPTY_THUMBS;
  const thumbsRef = useRef(thumbs);
  useEffect(() => {
    thumbsRef.current = thumbs;
  });
  const filmGenRef = useRef(0);
  const filmGenKeyRef = useRef("");

  const pack = useCallback(
    (h: number) => {
      const boxH = h / rows - ROW_PAD_Y;
      const boxW = boxH > 0 ? boxH * aspect : 0;
      const availW = width - PAD_X - LABEL_W;
      let count = boxW > 0 && availW > 0 ? Math.floor((availW + GAP) / (boxW + GAP)) : 0;
      if (count % 2 === 0) count -= 1;
      count = Math.max(1, count);
      return { boxH, boxW, count };
    },
    [aspect, rows, width],
  );

  const maxHeight = useCallback(() => {
    const availW = width - PAD_X - LABEL_W;
    if (aspect <= 0 || availW <= 0) return Number.POSITIVE_INFINITY;
    const boxH = Math.min(availW / aspect, CAP_BOX_H);
    return (boxH + ROW_PAD_Y) * rows;
  }, [aspect, width, rows]);

  const clampHeight = useCallback(
    (h: number) => {
      const max = maxHeight();
      const min = Math.min(COLLAPSED_H, max);
      return Math.max(min, Math.min(max, h));
    },
    [maxHeight],
  );

  const defaultHeight = useCallback(
    () => clampHeight((DEFAULT_BOX_H + ROW_PAD_Y) * rows),
    [clampHeight, rows],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => {
      setWidth(el.clientWidth);
      setHeight((h) => clampHeight(h));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [clampHeight]);

  useEffect(() => {
    if (!customized.current) setHeight(defaultHeight());
  }, [defaultHeight]);

  const onResizeDown = (e: React.PointerEvent) => {
    e.preventDefault();
    drag.current = { startY: e.clientY, startH: height, active: true, moved: false };
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
    }
  };
  const onResizeMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    const dy = e.clientY - drag.current.startY;
    if (Math.abs(dy) > 3) {
      drag.current.moved = true;
      customized.current = true;
    }
    setHeight(clampHeight(drag.current.startH - dy));
  };
  const onResizeUp = (e: React.PointerEvent) => {
    const wasDrag = drag.current.moved;
    drag.current.active = false;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
    }
    if (!wasDrag) {
      customized.current = true;
      const collapsed = pack(height).boxH < MIN_BOX_H;
      setHeight(collapsed ? defaultHeight() : clampHeight(COLLAPSED_H));
    }
  };

  const { boxH, boxW, count } = pack(height);
  const span = (count - 1) / 2;
  const showBoxes = sourceCount > 0 && width > 0 && boxH >= MIN_BOX_H;

  useEffect(() => {
    if (!ready || !active || sourceCount === 0) return;
    let stale = false;
    const t = setTimeout(() => {
      if (filmGenKeyRef.current !== paramsKey) {
        filmGenKeyRef.current = paramsKey;
        filmGenRef.current = nextRenderSeq();
      }
      const gen = filmGenRef.current;
      for (let s = 0; s < sourceCount; s++) {
        for (let i = base - span; i <= base + span; i++) {
          if (i < 0 || i > maxBase || thumbsRef.current[s]?.[i]) continue;
          const src = s;
          const frame = i;
          render(params, {
            sources: [src],
            position: frame,
            maxW: THUMB_WIDTH,
            cancelGroup: "filmstrip:tab",
            cancelSeq: gen,
          })
            .then((out) => {
              if (stale) return;
              setThumbCache((prev) => {
                const frames = prev.key === paramsKey ? prev.frames : {};
                if (frames[src]?.[frame]) return prev;
                return {
                  key: paramsKey,
                  frames: { ...frames, [src]: { ...(frames[src] ?? {}), [frame]: out.frames[0].src } },
                };
              });
            })
            .catch(() => {});
        }
      }
    }, 130);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [base, paramsKey, params, ready, active, maxBase, span, sourceCount]);

  return (
    <div
      ref={ref}
      style={{ height }}
      className={cn("relative shrink-0 border-t border-border", className)}
    >
      <div
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        onPointerCancel={onResizeUp}
        title="Drag to resize (click to toggle)"
        className="group absolute inset-x-0 -top-1 z-20 flex h-3 cursor-ns-resize touch-none items-center justify-center"
      >
        <div className="h-0.5 w-full bg-transparent transition-colors group-hover:bg-primary/60" />
      </div>

      {showBoxes && (
        <div className="flex h-full flex-col">
          {Array.from({ length: rows }, (_, r) => {
            const rowThumbs = thumbs[r] ?? {};
            const rowActive = r === activeSource;
            return (
              <div
                key={r}
                className="flex min-h-0 flex-1 items-center justify-center gap-1 overflow-hidden px-3 py-2"
              >
                <SourceBadge index={r} className="text-[10px] text-muted-foreground/60" />
                {Array.from({ length: count }, (_, k) => {
                  const i = base - span + k;
                  const valid = i >= 0 && i <= maxBase;
                  const current = i === base && rowActive;
                  return (
                    <button
                      key={k}
                      disabled={!valid}
                      onClick={() => {
                        onSelectSource(r);
                        setBase(clampFrame(i));
                      }}
                      style={{ height: boxH, width: boxW }}
                      className={cn(
                        "relative flex shrink-0 items-center justify-center overflow-hidden border bg-[#0b0b0d] outline-none disabled:opacity-25",
                        current
                          ? "border-primary ring-1 ring-primary"
                          : "border-border hover:border-[#3a3a42]",
                      )}
                      title={valid ? `Frame ${i}` : ""}
                    >
                      {valid && rowThumbs[i] ? (
                        <img
                          src={rowThumbs[i]}
                          alt={`Frame ${i + 1}`}
                          draggable={false}
                          className="animate-fade-in pointer-events-none h-full w-full object-contain"
                        />
                      ) : valid ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground/40" />
                      ) : null}
                      {valid && (
                        <span className="pointer-events-none absolute bottom-0 left-0 bg-black/60 px-1 py-px font-mono text-[9px] leading-none tabular-nums text-white/90">
                          {i + 1}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
