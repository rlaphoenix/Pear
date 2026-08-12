import { useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { clampNum, frameAt } from "@/lib/frames";
import { Tooltip } from "@/components/primitives/tooltip";
import type { Segment } from "@/lib/tauri";

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

function clock(n: number, fps: number): string {
  const totalMs = Math.round((n / (fps || 25)) * 1000);
  const ms = totalMs % 1000;
  const totalS = Math.floor(totalMs / 1000);
  const s = totalS % 60;
  const m = Math.floor(totalS / 60) % 60;
  const h = Math.floor(totalS / 3600);
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

const navBtn = (
  icon: React.ReactNode,
  tip: string,
  onClick: () => void,
  disabled = false,
) => (
  <Tooltip label={tip}>
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex size-7 items-center justify-center border border-border text-muted-foreground outline-none transition-colors hover:text-foreground disabled:opacity-40"
    >
      {icon}
    </button>
  </Tooltip>
);

function roundFps(fps: number): number {
  return Math.max(1, Math.round(fps || 25));
}

function framesToSmpte(frames: number, fps: number): string {
  const r = roundFps(fps);
  const sign = frames < 0 ? "-" : "";
  let f = Math.abs(Math.trunc(frames));
  const ff = f % r;
  f = Math.floor(f / r);
  const ss = f % 60;
  f = Math.floor(f / 60);
  const mm = f % 60;
  const hh = Math.floor(f / 60);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${sign}${p(hh)}:${p(mm)}:${p(ss)}:${p(ff)}`;
}

const smpte = (segs: Segment[], fps: number, n: number) => {
  const idx = frameAt(segs, n);
  return idx == null ? "-:-:-:-" : framesToSmpte(idx, fps);
};

interface SeekTrack {
  id: string;
  letter: string;
  segments: Segment[];
  fps: number;
}

interface Props {
  base: number;
  setBase: (n: number) => void;
  maxBase: number;
  tracks: SeekTrack[];
  onJumpKeyframe?: (dir: 1 | -1) => void;
  canKeyframe?: boolean;
  onJumpSegment?: (dir: 1 | -1) => void;
  canSegment?: boolean;
  playing?: boolean;
  onTogglePlay?: () => void;
}

export function Controls({
  base,
  setBase,
  maxBase,
  tracks,
  onJumpKeyframe,
  canKeyframe,
  onJumpSegment,
  canSegment,
  playing = false,
  onTogglePlay,
}: Props) {
  const clockFps = tracks[0]?.fps ?? 25;
  const [hover, setHover] = useState<{ x: number; n: number } | null>(null);
  const seeking = useRef(false);
  const enabled = maxBase > 0;

  const step = (delta: number) => setBase(clampNum(base + delta, 0, maxBase));

  const nFromX = (clientX: number, rect: DOMRect) =>
    clampNum(Math.round(((clientX - rect.left) / rect.width) * maxBase), 0, maxBase);
  const frac = maxBase > 0 ? base / maxBase : 0;

  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-t border-border bg-[#0e0e12] px-4">
      <div className="shrink-0">
        {navBtn(
          playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />,
          playing ? "Pause" : "Play",
          () => onTogglePlay?.(),
          !enabled,
        )}
      </div>

      <div className="shrink-0 font-mono tabular-nums leading-tight">
        <div className="text-[11px] text-foreground/80">{clock(base, clockFps)}</div>
        <div className="text-[10px] text-muted-foreground">
          {base + 1}
          <span className="text-muted-foreground/50"> / {maxBase + 1}</span>
        </div>
      </div>

      <div
        className={cn(
          "relative flex h-6 flex-1 items-center",
          enabled ? "cursor-pointer" : "cursor-default",
        )}
        onPointerDown={(e) => {
          if (!enabled) return;
          seeking.current = true;
          const r = e.currentTarget.getBoundingClientRect();
          setBase(nFromX(e.clientX, r));
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
          }
        }}
        onPointerMove={(e) => {
          if (!enabled) return;
          const r = e.currentTarget.getBoundingClientRect();
          const x = clampNum(e.clientX - r.left, 0, r.width);
          const n = nFromX(e.clientX, r);
          setHover({ x, n });
          if (seeking.current) setBase(n);
        }}
        onPointerUp={(e) => {
          seeking.current = false;
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
          }
        }}
        onPointerCancel={(e) => {
          seeking.current = false;
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
          }
        }}
        onMouseLeave={() => setHover(null)}
      >
        <div className="h-1 w-full overflow-hidden bg-[#26262d]">
          <div className="h-full bg-primary" style={{ width: `${frac * 100}%` }} />
        </div>
        <div
          className="pointer-events-none absolute size-3 -translate-x-1/2 rounded-full border-2 border-primary bg-foreground"
          style={{ left: `${frac * 100}%` }}
        />
        {hover && enabled && (
          <div
            className="pointer-events-none absolute -top-14 z-30 -translate-x-1/2 whitespace-nowrap bg-primary px-2 py-1 text-left font-mono text-[10px] leading-tight tabular-nums text-primary-foreground shadow-lg shadow-black/50"
            style={{ left: hover.x }}
          >
            <div>{hover.n + 1}</div>
            {tracks.map((t) => (
              <div key={t.id}>
                {t.letter} {smpte(t.segments, t.fps, hover.n)}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {navBtn(
          <SkipBack className="size-3.5" />,
          "Previous keyframe",
          () => onJumpKeyframe?.(-1),
          !canKeyframe,
        )}
        {navBtn(
          <ChevronsLeft className="size-3.5" />,
          "Previous segment",
          () => onJumpSegment?.(-1),
          !canSegment,
        )}
        {navBtn(<ChevronLeft className="size-3.5" />, "Back 1 frame", () => step(-1), !enabled)}
        {navBtn(<ChevronRight className="size-3.5" />, "Forward 1 frame", () => step(1), !enabled)}
        {navBtn(
          <ChevronsRight className="size-3.5" />,
          "Next segment",
          () => onJumpSegment?.(1),
          !canSegment,
        )}
        {navBtn(
          <SkipForward className="size-3.5" />,
          "Next keyframe",
          () => onJumpKeyframe?.(1),
          !canKeyframe,
        )}
      </div>
    </div>
  );
}
