import { useMemo } from "react";
import type { UiSource } from "@/state/AppState";

export interface IndexingStatus {
  name: string | null;
  percent: number | null;
  current: number;
  total: number;
}

const IDLE: IndexingStatus = { name: null, percent: null, current: 0, total: 0 };

const basename = (p: string) => p.split(/[\\/]/).pop() || p;

export function useIndexingStatus(sources: UiSource[]): IndexingStatus {
  return useMemo(() => {
    const withPath = sources.filter((s) => s.path);
    const idx = withPath.findIndex((s) => typeof s.indexProgress === "number");
    if (idx < 0) return IDLE;
    const current = withPath[idx];
    return {
      name: current.path ? basename(current.path) : null,
      percent: current.indexProgress,
      current: idx + 1,
      total: withPath.length,
    };
  }, [sources]);
}
