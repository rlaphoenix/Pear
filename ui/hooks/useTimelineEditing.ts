import { useCallback, useEffect, useRef } from "react";
import { clampNum } from "@/lib/frames";
import type { Segment } from "@/lib/tauri";
import type { UiSource } from "@/state/AppState";
import { nearestFreePos, neighborBounds } from "@/lib/timeline";
import type { Sel, TrackState } from "@/lib/timeline";

interface EditingOpts {
  sources: UiSource[];
  setSegments: (id: string, segments: Segment[]) => void;
  sel: Sel | null;
  setSel: (s: Sel | null) => void;
  selRef: React.MutableRefObject<Sel | null>;
  ripple: boolean;
  base: number;
  pxPerFrame: number;
  snapshot: () => TrackState;
  commitHistory: (before: TrackState) => void;
}

export function useTimelineEditing(opts: EditingOpts) {
  const {
    sources,
    setSegments,
    sel,
    setSel,
    selRef,
    ripple,
    base,
    pxPerFrame,
    snapshot,
    commitHistory,
  } = opts;

  const srcById = (id: string): UiSource | undefined => sources.find((s) => s.id === id);
  const segsOf = (id: string) => srcById(id)?.segments ?? [];
  const total = (id: string) => srcById(id)?.info?.total ?? 0;

  const commit = (id: string, segs: Segment[]) =>
    setSegments(
      id,
      [...segs].sort((a, b) => a.pos - b.pos),
    );

  const editSide = (id: string, fn: (segs: Segment[]) => Segment[] | null) => {
    const before = snapshot();
    const out = fn(segsOf(id));
    if (!out) return;
    commitHistory(before);
    commit(id, out);
  };

  const setName = (id: string, index: number, name: string) =>
    editSide(id, (segs) =>
      segs[index]?.name === name ? null : segs.map((s, i) => (i === index ? { ...s, name } : s)),
    );

  const duplicateSeg = (id: string, index: number) =>
    editSide(id, (segs) => {
      const s = segs[index];
      if (!s) return null;
      const end = s.pos + s.len;
      const shifted = segs.map((x) => (x.pos >= end ? { ...x, pos: x.pos + s.len } : x));
      return [...shifted, { ...s, id: crypto.randomUUID(), pos: end }];
    });

  const alignStartTo = (id: string, index: number, target: number) =>
    editSide(id, (segs) => {
      const s = segs[index];
      if (!s) return null;
      const [left, right] = neighborBounds(segs, index);
      const minPos = Math.max(left, 1 - s.len);
      const maxPos = right === Infinity ? Infinity : right - s.len;
      const pos = clampNum(target, minPos, Math.max(minPos, maxPos));
      return pos === s.pos ? null : segs.map((x, i) => (i === index ? { ...x, pos } : x));
    });

  const nudgeRef = useRef<(dir: number) => void>(() => {});
  useEffect(() => {
    nudgeRef.current = (dir: number) => {
      const s = selRef.current;
      if (!s) return;
      const seg = segsOf(s.id)[s.index];
      if (!seg) return;
      alignStartTo(s.id, s.index, seg.pos + dir);
    };
  });

  const startDrag = useCallback(
    (
      e: React.PointerEvent,
      kind: "move" | "trimL" | "trimR",
      id: string,
      index: number,
    ) => {
      e.stopPropagation();
      e.preventDefault();
      const wasSelected = selRef.current?.id === id && selRef.current.index === index;
      setSel({ id, index });
      const segs = segsOf(id);
      const orig = segs[index];
      const tot = total(id);
      const [left, right] = neighborBounds(segs, index);
      const startX = e.clientX;
      const before = snapshot();
      let latest = segs;

      const onMove = (ev: PointerEvent) => {
        const d = Math.round((ev.clientX - startX) / pxPerFrame);
        let next: Segment;
        if (kind === "move") {
          const pos = nearestFreePos(segs, index, orig.pos + d);
          next = { ...orig, pos };
        } else if (kind === "trimL") {
          const dLo = Math.max(-orig.src, left - orig.pos);
          const dHi = orig.len - 1;
          const dd = clampNum(d, dLo, dHi);
          next = { ...orig, src: orig.src + dd, len: orig.len - dd, pos: orig.pos + dd };
        } else {
          const dHi = Math.min(
            tot > 0 ? tot - orig.src - orig.len : Infinity,
            right === Infinity ? Infinity : right - orig.pos - orig.len,
          );
          const dd = clampNum(d, 1 - orig.len, Math.max(1 - orig.len, dHi));
          next = { ...orig, len: orig.len + dd };
        }
        latest = segs.slice();
        latest[index] = next;
        setSegments(id, latest);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        const f = latest[index];
        const changed = f.pos !== orig.pos || f.len !== orig.len || f.src !== orig.src;
        if (changed) {
          commitHistory(before);
        }
        const sorted = [...latest].sort((a, b) => a.pos - b.pos);
        setSegments(id, sorted);
        if (changed && kind === "move") {
          const ni = sorted.indexOf(f);
          if (ni >= 0) setSel({ id, index: ni });
        }
        if (!changed && kind === "move" && wasSelected) setSel(null);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pxPerFrame, sources],
  );

  const splitSideAt = (id: string, t: number): boolean => {
    const segs = segsOf(id);
    const i = segs.findIndex((s) => t > s.pos && t < s.pos + s.len);
    if (i < 0) return false;
    const s = segs[i];
    const leftLen = t - s.pos;
    const out = segs.slice();
    out.splice(
      i,
      1,
      { ...s, len: leftLen },
      { ...s, id: crypto.randomUUID(), src: s.src + leftLen, len: s.len - leftLen, pos: t },
    );
    commit(id, out);
    return true;
  };
  const razorAt = (id: string, t: number) => {
    const before = snapshot();
    if (splitSideAt(id, t)) commitHistory(before);
  };
  const splitSelected = () => {
    if (!sel) return;
    const seg = segsOf(sel.id)[sel.index];
    if (!seg || base <= seg.pos || base >= seg.pos + seg.len) return;
    const before = snapshot();
    if (splitSideAt(sel.id, base)) commitHistory(before);
  };

  const deleteSeg = useCallback(
    (id: string, index: number) => {
      const segs = segsOf(id);
      const removed = segs[index];
      if (!removed) return;
      if (segs.length <= 1) return;
      let out = segs.filter((_, i) => i !== index);
      if (ripple) {
        out = out.map((s) => (s.pos > removed.pos ? { ...s, pos: s.pos - removed.len } : s));
      }
      commitHistory(snapshot());
      commit(id, out);
      setSel(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ripple, sources],
  );
  const deleteSelected = useCallback(() => {
    if (sel) deleteSeg(sel.id, sel.index);
  }, [sel, deleteSeg]);

  return {
    segsOf,
    total,
    commit,
    editSide,
    setName,
    duplicateSeg,
    alignStartTo,
    nudgeRef,
    startDrag,
    splitSideAt,
    razorAt,
    splitSelected,
    deleteSeg,
    deleteSelected,
  };
}

export type TimelineEditing = ReturnType<typeof useTimelineEditing>;
