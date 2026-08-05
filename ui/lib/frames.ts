import type { Segment } from "@/lib/tauri";

export function frameAt(segments: Segment[], t: number): number | null {
  for (const s of segments) {
    if (t >= s.pos && t < s.pos + s.len) return s.src + (t - s.pos);
  }
  return null;
}

export function projectFrameOf(segments: Segment[], srcFrame: number): number | null {
  for (const s of segments) {
    if (srcFrame >= s.src && srcFrame < s.src + s.len) return s.pos + (srcFrame - s.src);
  }
  return null;
}

export function projLen(segments: Segment[]): number {
  let end = 0;
  for (const s of segments) end = Math.max(end, s.pos + s.len);
  return Math.max(0, end);
}

export function projectLength(tracks: Segment[][]): number {
  return Math.max(0, ...tracks.map(projLen));
}

export function projectStart(tracks: Segment[][]): number {
  let start = 0;
  for (const track of tracks) for (const s of track) start = Math.min(start, s.pos);
  return start;
}

export function defaultSegments(total: number): Segment[] {
  return total > 0 ? [{ id: crypto.randomUUID(), src: 0, len: total, pos: 0 }] : [];
}

export const clampNum = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
