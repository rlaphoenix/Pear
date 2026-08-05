import { cn } from "@/lib/utils";
import { clampNum } from "@/lib/frames";
import type { Segment } from "@/lib/tauri";
import type { UiSource } from "@/state/AppState";

export const RULER_H = 22;
export const LANE_H = 62;
export const GUTTER_W = 120;
export const GUTTER_MIN = 96;
export const HANDLE = 6;
export const MIN_THUMB_W = 32;
export const ZOOM_MAX = 8;
export const EDGE_PAD = 32;
export const GUIDE_PREVIEW_W = 160;

export type Tool = "select" | "razor";
export type TrackState = Record<string, Segment[]>;
export type Sel = { id: string; index: number };
export type Menu = { x: number; y: number; id: string; index: number };

export const thumbCache = new Map<string, string>();

let measureCanvas: HTMLCanvasElement | null = null;
export function measureText(text: string, font: string): number {
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return text.length * 7;
  ctx.font = font;
  return ctx.measureText(text).width;
}

export const trackLabel = (source: UiSource) =>
  source.name || source.path?.split(/[\\/]/).pop() || "";

export const btnCls = (on = false) =>
  cn(
    "flex items-center gap-1.5 border px-2 py-1 text-xs outline-none transition-colors disabled:opacity-40",
    on
      ? "border-primary bg-primary/15 text-foreground"
      : "border-border text-muted-foreground hover:text-foreground",
  );

export function neighborBounds(segs: Segment[], index: number): [number, number] {
  const me = segs[index];
  let left = Number.NEGATIVE_INFINITY;
  let right = Number.POSITIVE_INFINITY;
  segs.forEach((s, i) => {
    if (i === index) return;
    if (s.pos + s.len <= me.pos) left = Math.max(left, s.pos + s.len);
    else if (s.pos >= me.pos + me.len) right = Math.min(right, s.pos);
  });
  return [left, right];
}

export function nearestFreePos(segs: Segment[], index: number, desired: number): number {
  const me = segs[index];
  const gmin = 1 - me.len;
  const occ = segs
    .reduce<[number, number][]>((acc, s, i) => {
      if (i !== index) acc.push([s.pos, s.pos + s.len]);
      return acc;
    }, [])
    .sort((a, b) => a[0] - b[0]);

  let best = Math.max(gmin, desired);
  let bestDist = Infinity;
  const consider = (loRaw: number, hi: number) => {
    const lo = Math.max(loRaw, gmin);
    const posHi = hi === Infinity ? Infinity : hi - me.len;
    if (posHi < lo) return;
    const p = posHi === Infinity ? Math.max(lo, desired) : clampNum(desired, lo, posHi);
    const dist = Math.abs(p - desired);
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  };

  let prevEnd = Number.NEGATIVE_INFINITY;
  for (const [os, oe] of occ) {
    consider(prevEnd, os);
    prevEnd = Math.max(prevEnd, oe);
  }
  consider(prevEnd, Infinity);
  return best;
}

export function niceStep(minFrames: number): number {
  const steps = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  for (const s of steps) if (s >= minFrames) return s;
  return 10000;
}
