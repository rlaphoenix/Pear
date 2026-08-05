import { useCallback, useRef, useState } from "react";

const COMPARISONS_MIN_H = 96;
const COMPARISONS_HEADER_H = 36;

export function useComparisonsResize() {
  const [comparisonsHeight, setComparisonsHeight] = useState(136);
  const [comparisonsCollapsed, setComparisonsCollapsed] = useState(false);
  const comparisonsResize = useRef({ startY: 0, startH: 0, active: false });
  const onComparisonsResizeDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      comparisonsResize.current = { startY: e.clientY, startH: comparisonsHeight, active: true };
      try {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      } catch {}
    },
    [comparisonsHeight],
  );
  const onComparisonsResizeMove = useCallback((e: React.PointerEvent) => {
    if (!comparisonsResize.current.active) return;
    const dy = e.clientY - comparisonsResize.current.startY;
    const max = Math.max(COMPARISONS_MIN_H, Math.round(window.innerHeight * 0.7));
    const next = comparisonsResize.current.startH - dy;
    setComparisonsHeight(Math.min(max, Math.max(COMPARISONS_MIN_H, next)));
  }, []);
  const onComparisonsResizeUp = useCallback((e: React.PointerEvent) => {
    comparisonsResize.current.active = false;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {}
  }, []);

  return {
    height: comparisonsHeight,
    collapsed: comparisonsCollapsed,
    setCollapsed: setComparisonsCollapsed,
    headerHeight: COMPARISONS_HEADER_H,
    onResizeDown: onComparisonsResizeDown,
    onResizeMove: onComparisonsResizeMove,
    onResizeUp: onComparisonsResizeUp,
  };
}
