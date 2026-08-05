import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { clampNum, projLen, projectStart } from "@/lib/frames";
import type { UiSource } from "@/state/AppState";
import { EDGE_PAD, MIN_THUMB_W, ZOOM_MAX, niceStep } from "@/lib/timeline";

export function useTimelineViewport(
  sources: UiSource[],
  setBase: (frame: number) => void,
  maxBase: number,
) {
  const [pxPerFrame, setPxPerFrame] = useState(0.05);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [viewW, setViewW] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const fitted = useRef(false);
  const pxRef = useRef(pxPerFrame);
  useEffect(() => {
    pxRef.current = pxPerFrame;
  });
  const pendingScrollLeft = useRef<number | null>(null);

  const allSegs = sources.map((s) => s.segments);
  const fpsA = sources[0]?.info?.fps || 25;
  const origin = projectStart(allSegs);
  const rightEdge = Math.max(...allSegs.map(projLen), 1);
  const span = Math.max(rightEdge - origin, 1);
  const contentW = Math.max(span * pxPerFrame, 1);
  const scrollW = contentW + EDGE_PAD;
  const zoomFloor = clampNum((viewW - EDGE_PAD) / span, 0.002, 4);
  const zoomFloorRef = useRef(zoomFloor);
  useEffect(() => {
    zoomFloorRef.current = zoomFloor;
  });
  const xOf = (frame: number) => (frame - origin) * pxPerFrame;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    setViewW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (fitted.current || viewW <= 0 || span <= 1) return;
    setPxPerFrame(zoomFloor);
    fitted.current = true;
  }, [viewW, span, zoomFloor]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const frameAtCursor = (cursorX + el.scrollLeft) / pxRef.current;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newPx = clampNum(pxRef.current * factor, zoomFloorRef.current, ZOOM_MAX);
      pendingScrollLeft.current = frameAtCursor * newPx - cursorX;
      setPxPerFrame(newPx);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useLayoutEffect(() => {
    if (pendingScrollLeft.current != null && scrollRef.current) {
      scrollRef.current.scrollLeft = pendingScrollLeft.current;
      setScrollLeft(scrollRef.current.scrollLeft);
      pendingScrollLeft.current = null;
    }
  }, [pxPerFrame]);

  const startBarDrag = useCallback(
    (e: React.PointerEvent, mode: "pan" | "left" | "right") => {
      e.stopPropagation();
      e.preventDefault();
      const el = scrollRef.current;
      if (!el || viewW <= 0 || span <= 1) return;
      const startX = e.clientX;
      const px0 = pxRef.current;
      const trackPxPerFrame = viewW / span;
      const scroll0 = el.scrollLeft;
      const frameL0 = origin + scroll0 / px0;
      const frameR0 = origin + (scroll0 + viewW) / px0;
      const zoomMax = Math.min(ZOOM_MAX, Math.max(px0, (viewW * viewW) / (span * MIN_THUMB_W)));
      const zoomMin = zoomFloorRef.current;
      const cursorStyle = document.createElement("style");
      cursorStyle.textContent = `*{cursor:${mode === "pan" ? "grabbing" : "ew-resize"}!important}`;
      document.head.appendChild(cursorStyle);
      const onMove = (ev: PointerEvent) => {
        const dFrame = (ev.clientX - startX) / trackPxPerFrame;
        if (mode === "pan") {
          const scrollW = contentW + EDGE_PAD;
          const dContent = (ev.clientX - startX) * (scrollW / viewW);
          el.scrollLeft = clampNum(scroll0 + dContent, 0, Math.max(0, scrollW - viewW));
          return;
        }
        const vis =
          mode === "left" ? frameR0 - (frameL0 + dFrame) : frameR0 + dFrame - frameL0;
        const newPx = clampNum(viewW / Math.max(1, vis), zoomMin, zoomMax);
        const newVis = viewW / newPx;
        const newFrameL = mode === "left" ? frameR0 - newVis : frameL0;
        pendingScrollLeft.current = (newFrameL - origin) * newPx;
        setPxPerFrame(newPx);
      };
      const onUp = () => {
        cursorStyle.remove();
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [viewW, span, origin, contentW],
  );

  const rawFrameAtX = (clientX: number) => {
    const el = scrollRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const x = clientX - r.left + el.scrollLeft;
    return Math.round(x / pxPerFrame) + origin;
  };
  const scrubFrameAtX = (clientX: number) => clampNum(rawFrameAtX(clientX), 0, maxBase);
  const startScrub = (e: React.PointerEvent) => {
    e.preventDefault();
    setBase(scrubFrameAtX(e.clientX));
    const onMove = (ev: PointerEvent) => setBase(scrubFrameAtX(ev.clientX));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const tickStep = niceStep(70 / pxPerFrame);
  const thumbW =
    contentW > 0 ? Math.max(MIN_THUMB_W, Math.min(viewW, (viewW / scrollW) * viewW)) : viewW;
  const thumbLeft =
    contentW > 0
      ? clampNum((scrollLeft / scrollW) * viewW, 0, Math.max(0, viewW - thumbW))
      : 0;
  const ticks: number[] = [];
  for (let f = Math.floor(origin / tickStep) * tickStep; f <= rightEdge; f += tickStep)
    ticks.push(f);
  const fmt = (frame: number) => {
    const s = Math.abs(frame) / fpsA;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${frame < 0 ? "-" : ""}${m}:${String(sec).padStart(2, "0")}`;
  };
  const zoom = (factor: number) =>
    setPxPerFrame((p) => clampNum(p * factor, zoomFloorRef.current, ZOOM_MAX));

  return {
    scrollRef,
    viewW,
    scrollLeft,
    setScrollLeft,
    pxPerFrame,
    origin,
    span,
    contentW,
    scrollW,
    xOf,
    startBarDrag,
    rawFrameAtX,
    startScrub,
    tickStep,
    thumbW,
    thumbLeft,
    ticks,
    fmt,
    zoom,
  };
}

export type TimelineViewport = ReturnType<typeof useTimelineViewport>;
