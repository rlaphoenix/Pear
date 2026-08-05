import { useCallback, useState } from "react";
import type { Segment } from "@/lib/tauri";
import type { UiSource } from "@/state/AppState";
import type { TrackState } from "@/lib/timeline";

export function useTimelineHistory(
  sources: UiSource[],
  setSegments: (id: string, segments: Segment[]) => void,
) {
  const [past, setPast] = useState<TrackState[]>([]);
  const [future, setFuture] = useState<TrackState[]>([]);
  const snapshot = (): TrackState =>
    Object.fromEntries(sources.map((s) => [s.id, s.segments]));
  const commitHistory = useCallback((before: TrackState) => {
    setPast((p) => [...p, before].slice(-100));
    setFuture([]);
  }, []);
  const applyState = (st: TrackState) => {
    for (const [id, segs] of Object.entries(st)) setSegments(id, segs);
  };
  const undo = useCallback(() => {
    if (!past.length) return;
    setFuture((f) => [...f, snapshot()]);
    applyState(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [past, sources]);
  const redo = useCallback(() => {
    if (!future.length) return;
    setPast((p) => [...p, snapshot()]);
    applyState(future[future.length - 1]);
    setFuture((f) => f.slice(0, -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [future, sources]);
  const resetHistory = () => {
    setPast([]);
    setFuture([]);
  };
  return { past, future, snapshot, commitHistory, undo, redo, resetHistory };
}

export type TimelineHistory = ReturnType<typeof useTimelineHistory>;
