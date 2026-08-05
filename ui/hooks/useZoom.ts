import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ZoomMode } from "@/lib/tauri";

const TRANSITION = "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)";

interface View {
  zoom: number;
  x: number;
  y: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const MAX = 16;
const MIN_OUT = 0.05;

const ppZoom = (L: number) => (L >= 0 ? L + 1 : 1 / (1 - L));
const ppNearest = (z: number) =>
  z >= 1 ? Math.max(0, Math.round(z) - 1) : -(Math.round(1 / z) - 1);
const ppFloor = (z: number) => (z >= 1 ? Math.floor(z) : 1 / Math.ceil(1 / z));

export type { ZoomMode };

export function useZoom(
  contentW: number,
  contentH: number,
  defaultMode: ZoomMode = "fit",
  pixelPerfect = false,
  fullscreen = false,
  bands = 1,
) {
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  const elRef = useRef<HTMLElement | null>(null);
  const wheelCleanup = useRef<(() => void) | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const drag = useRef({ active: false, sx: 0, sy: 0, px: 0, py: 0, moved: false });
  const needsFit = useRef(true);

  const content = useRef({ w: contentW, h: contentH });
  const modeRef = useRef(defaultMode);
  const bandsRef = useRef(bands);
  const ppRef = useRef(pixelPerfect);
  const followFit = useRef(defaultMode === "fit");
  const refitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const immediateRefit = useRef(false);
  const immediateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fsRef = useRef(fullscreen);

  const [dragging, setDragging] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [viewportEl, setViewportEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    viewRef.current = view;
    content.current = { w: contentW, h: contentH };
    modeRef.current = defaultMode;
    bandsRef.current = Math.max(1, bands);
    ppRef.current = pixelPerfect;
  });

  useLayoutEffect(() => {
    if (fsRef.current === fullscreen) return;
    fsRef.current = fullscreen;
    immediateRefit.current = true;
    const id = setTimeout(() => {
      immediateRefit.current = false;
    }, 1000);
    immediateTimer.current = id;
    return () => clearTimeout(id);
  }, [fullscreen]);

  const stage = () => {
    const el = elRef.current;
    return { W: (el?.clientWidth ?? 0) / bandsRef.current, H: el?.clientHeight ?? 0 };
  };

  const fitZoom = () => {
    const { W, H } = stage();
    const { w, h } = content.current;
    if (!W || !H || !w || !h) return 1;
    return Math.min(W / w, H / h);
  };
  const minZoom = () => Math.min(MIN_OUT, fitZoom());
  const clampZoom = (z: number) => clamp(z, minZoom(), MAX);

  const clampView = (zoom: number, x: number, y: number): View => {
    const { W, H } = stage();
    const { w, h } = content.current;
    const cw = w * zoom;
    const ch = h * zoom;
    const nx = cw <= W ? (W - cw) / 2 : clamp(x, W - cw, 0);
    const ny = ch <= H ? (H - ch) / 2 : clamp(y, H - ch, 0);
    return { zoom, x: nx, y: ny };
  };

  const applyFit = () => {
    const raw = fitZoom();
    const z = clampZoom(ppRef.current ? ppFloor(raw) : raw);
    const { W, H } = stage();
    const { w, h } = content.current;
    setView(clampView(z, (W - w * z) / 2, (H - h * z) / 2));
    followFit.current = true;
  };

  const applyActual = () => {
    const { W, H } = stage();
    const { w, h } = content.current;
    const z = clampZoom(1);
    setView(clampView(z, (W - w * z) / 2, (H - h * z) / 2));
    followFit.current = false;
  };

  const applyDefault = () => (modeRef.current === "actual" ? applyActual() : applyFit());

  const tryFit = useCallback(() => {
    const el = elRef.current;
    if (!needsFit.current || !el || !el.clientWidth || content.current.w <= 0) return;
    needsFit.current = false;
    applyDefault();
    requestAnimationFrame(() => setAnimate(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    needsFit.current = true;
    setAnimate(false);
    tryFit();
  }, [contentW, contentH, bands, tryFit]);

  const setViewportRef = useCallback(
    (el: HTMLElement | null) => {
      elRef.current = el;
      wheelCleanup.current?.();
      wheelCleanup.current = null;
      if (!el) {
        setViewportEl(null);
        return;
      }

      const onWheel = (e: WheelEvent) => {
        if ((e.target as Element | null)?.closest("[data-wheel-scroll]")) return;
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const bw = rect.width / bandsRef.current;
        const cx = (e.clientX - rect.left) % bw;
        const cy = e.clientY - rect.top;
        const v = viewRef.current;
        let nz: number;
        if (ppRef.current) {
          const dir = e.deltaY < 0 ? 1 : -1;
          nz = clampZoom(ppZoom(ppNearest(v.zoom) + dir));
        } else {
          nz = clampZoom(v.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
        }
        followFit.current = false;
        const ratio = nz / v.zoom;
        setView(clampView(nz, cx - (cx - v.x) * ratio, cy - (cy - v.y) * ratio));
      };
      el.addEventListener("wheel", onWheel, { passive: false });
      wheelCleanup.current = () => el.removeEventListener("wheel", onWheel);

      setViewportEl(el);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    const el = viewportEl;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      if (needsFit.current) {
        tryFit();
        return;
      }
      setView((v) => clampView(v.zoom, v.x, v.y));
      if (!followFit.current) return;
      if (immediateRefit.current) {
        if (refitTimer.current) {
          clearTimeout(refitTimer.current);
          refitTimer.current = null;
        }
        applyFit();
      } else {
        if (refitTimer.current) clearTimeout(refitTimer.current);
        refitTimer.current = setTimeout(() => {
          if (followFit.current) applyFit();
        }, 200);
      }
    });
    ro.observe(el);
    roRef.current = ro;
    tryFit();

    return () => {
      ro.disconnect();
      roRef.current = null;
      if (refitTimer.current) {
        clearTimeout(refitTimer.current);
        refitTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportEl, tryFit]);

  const pannable = () => {
    const { W, H } = stage();
    const { w, h } = content.current;
    return w * viewRef.current.zoom > W + 1 || h * viewRef.current.zoom > H + 1;
  };

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 || !pannable()) return;
    const v = viewRef.current;
    drag.current = { active: true, sx: e.clientX, sy: e.clientY, px: v.x, py: v.y, moved: false };
    setDragging(true);
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.sx;
    const dy = e.clientY - drag.current.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.current.moved = true;
    const v = viewRef.current;
    setView(clampView(v.zoom, drag.current.px + dx, drag.current.py + dy));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (drag.current.active) {
      try {
        (e.currentTarget as Element).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    drag.current.active = false;
    setDragging(false);
  }, []);

  const consumeDrag = useCallback(() => {
    const m = drag.current.moved;
    drag.current.moved = false;
    return m;
  }, []);

  const toggle = useCallback(() => {
    if (Math.abs(viewRef.current.zoom - 1) < 0.001) applyFit();
    else applyActual();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stageEl = elRef.current;
  const stageWNow = (stageEl?.clientWidth ?? 0) / Math.max(1, bands);
  const stageHNow = stageEl?.clientHeight ?? 0;
  const zoomed = contentW * view.zoom > stageWNow + 1 || contentH * view.zoom > stageHNow + 1;

  return {
    transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
    x: view.x,
    y: view.y,
    scale: view.zoom,
    transition: dragging || !animate ? "none" : TRANSITION,
    percent: Math.round(view.zoom * 100),
    zoomed,
    setViewportRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    consumeDrag,
    toggle,
  };
}

export type Zoom = ReturnType<typeof useZoom>;
