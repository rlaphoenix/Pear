import { useCallback, useEffect, useRef, useState } from "react";
import { pickPositions, type AppSettings, type GenParams } from "@/lib/tauri";
import { toast } from "@/lib/toast";

type Options = {
  comparisons: number[];
  ready: boolean;
  initializing: boolean;
  params: GenParams;
  appSettings: AppSettings;
  base: number | null;
  setComparisons: (positions: number[]) => void;
  appendComparisons: (positions: number[]) => void;
};

export function useComparisons({
  comparisons,
  ready,
  initializing,
  params,
  appSettings,
  base,
  setComparisons,
  appendComparisons,
}: Options) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const currentPos = comparisons[selectedIndex];

  useEffect(() => {
    setSelectedIndex((i) => Math.min(i, Math.max(0, comparisons.length - 1)));
  }, [comparisons.length]);

  const genToken = useRef(0);
  useEffect(() => {
    if (!ready || initializing || comparisons.length > 0) return;
    const token = ++genToken.current;
    (async () => {
      try {
        const picked = await pickPositions(params, appSettings.defaultCount, appSettings.minDistance, []);
        if (token === genToken.current && picked.length) setComparisons(picked);
      } catch {
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, initializing, comparisons.length]);

  const onAdd = useCallback(async () => {
    if (!ready) return;
    try {
      const picked = await pickPositions(params, 1, appSettings.minDistance, comparisons);
      if (picked.length) appendComparisons(picked);
      else toast({ kind: "error", msg: "No room for another comparison - lower the minimum distance." });
    } catch (e) {
      toast({ kind: "error", msg: `Couldn't add a comparison: ${String(e)}` });
    }
  }, [ready, params, appSettings.minDistance, comparisons, appendComparisons]);

  const onAddCurrentComparison = useCallback(() => {
    if (!ready || base == null) return;
    if (comparisons.includes(base)) {
      toast({ kind: "error", msg: "That frame is already a comparison." });
      return;
    }
    appendComparisons([base]);
    toast({ kind: "success", msg: `Added frame ${base} as a comparison.` });
  }, [ready, base, comparisons, appendComparisons]);

  const onDeleteSelected = useCallback(
    (positions: number[]) => {
      if (positions.length === 0) return;
      const kill = new Set(positions);
      setComparisons(comparisons.filter((p) => !kill.has(p)));
    },
    [comparisons, setComparisons],
  );

  const onRerollSelected = useCallback(
    async (positions: number[]) => {
      if (!ready || positions.length === 0) return;
      const kill = new Set(positions);
      const kept = comparisons.filter((p) => !kill.has(p));
      try {
        const picked = await pickPositions(params, positions.length, appSettings.minDistance, kept);
        if (!picked.length) {
          toast({ kind: "error", msg: "No room to re-roll - lower the minimum distance." });
          return;
        }
        let k = 0;
        const next = comparisons.map((p) => (kill.has(p) && k < picked.length ? picked[k++] : p));
        setComparisons(next);
      } catch (e) {
        toast({ kind: "error", msg: `Couldn't re-roll comparisons: ${String(e)}` });
      }
    },
    [ready, comparisons, params, appSettings.minDistance, setComparisons],
  );

  const onSelect = useCallback((i: number) => {
    setSelectedIndex(i);
  }, []);

  return {
    selectedIndex,
    currentPos,
    onSelect,
    onAdd,
    onAddCurrentComparison,
    onDeleteSelected,
    onRerollSelected,
  };
}
