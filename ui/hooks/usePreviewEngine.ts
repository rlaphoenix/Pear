import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Dispatch,
  type ForwardedRef,
  type SetStateAction,
} from "react";
import { decodeFrame, rawFrameIds } from "@/lib/utils";
import { render, releaseFrames, type Comparison, type GenParams, type SourceOut } from "@/lib/tauri";
import type { PreviewMode } from "@/lib/preview";
import type { UiSource } from "@/state/AppState";

export interface PreviewTabHandle {
  getFrame: () => SourceOut | null;
}

const PREFETCH_CONCURRENCY = Math.max(2, Math.min(navigator.hardwareConcurrency || 4, 8));
const PREFETCH_WINDOW = PREFETCH_CONCURRENCY;

interface PreviewInputs {
  base: number;
  params: GenParams;
  ready: boolean;
  active: boolean;
  mode: PreviewMode;
  sourceIndex: number;
}

interface PrefetchEntry {
  frame: SourceOut;
  canvasW: number;
  canvasH: number;
  sourceIdx: number;
}

interface EngineArgs {
  params: GenParams;
  paramsKey: string;
  ready: boolean;
  active: boolean;
  mode: PreviewMode;
  sourceIndex: number;
  base: number;
  setBase: Dispatch<SetStateAction<number>>;
  maxBase: number;
  sources: UiSource[];
  weaveFrames: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function usePreviewEngine(
  {
    params,
    paramsKey,
    ready,
    active,
    mode,
    sourceIndex,
    base,
    setBase,
    maxBase,
    sources,
    weaveFrames,
  }: EngineArgs,
  ref: ForwardedRef<PreviewTabHandle>,
) {
  const [preview, setPreview] = useState<Comparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceCount = params.sources.length;

  const weaveFramesRef = useRef(1);
  useEffect(() => {
    weaveFramesRef.current = Math.max(1, Math.floor(weaveFrames || 1));
  });

  const [displayIndex, setDisplayIndex] = useState(sourceIndex);
  const displayIndexRef = useRef(displayIndex);
  useEffect(() => {
    displayIndexRef.current = displayIndex;
  });
  const pendingRevealRef = useRef<{ index: number; src: string } | null>(null);
  const onLayerPainted = useCallback((index: number, src: string) => {
    const p = pendingRevealRef.current;
    if (p && p.index === index && p.src === src) {
      pendingRevealRef.current = null;
      setDisplayIndex(index);
    }
  }, []);

  const currentFrame = preview
    ? (preview.sources[displayIndex] ?? preview.sources[0]) ?? null
    : null;
  useImperativeHandle(ref, () => ({ getFrame: () => currentFrame }), [currentFrame]);

  useEffect(() => {
    previewSourcesRef.current = [];
    clearPrefetch();
  }, [paramsKey, maxBase]);

  const stagedRef = useRef<number[]>([]);
  const previewSourcesRef = useRef<SourceOut[]>([]);
  const prefetchRef = useRef<Map<number, PrefetchEntry>>(new Map());
  const prefetchInflightRef = useRef<Set<number>>(new Set());
  const prefetchGenRef = useRef(0);
  const seqRef = useRef(0);

  // At most ONE preview render is in flight; seeks that arrive while it runs collapse to the
  // LATEST. Cooperative cancellation alone can't bound this: a preview render dispatches its
  // handful of frames before a newer render can supersede it, so the frames are already
  // queued in VapourSynth.
  const previewBusyRef = useRef(false);
  const previewDirtyRef = useRef(false);
  const mountedRef = useRef(true);
  const previewInputs = useRef<PreviewInputs>({ base, params, ready, active, mode, sourceIndex });
  useEffect(() => {
    previewInputs.current = { base, params, ready, active, mode, sourceIndex };
  });
  // Set (not just clear) in the body so StrictMode's mount->unmount->remount leaves it true.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearPrefetch();
    };
  }, []);

  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(playing);
  useEffect(() => {
    playingRef.current = playing;
  });
  const fpsList = sources.reduce<number[]>((acc, s) => {
    const fps = s.info?.fps || 0;
    if (fps > 0) acc.push(fps);
    return acc;
  }, []);
  const playFps = fpsList.length ? Math.max(...fpsList) : 25;
  const maxBaseRef = useRef(maxBase);
  const frameIntervalRef = useRef(1000 / playFps);
  useEffect(() => {
    maxBaseRef.current = maxBase;
    frameIntervalRef.current = 1000 / playFps;
  });
  const lastAdvanceRef = useRef(0);
  const playTimerRef = useRef<number | null>(null);
  const clearPlayTimer = () => {
    if (playTimerRef.current != null) {
      window.clearTimeout(playTimerRef.current);
      playTimerRef.current = null;
    }
  };
  const advancePlayRef = useRef<() => void>(() => {});

  const shownIndexAt = (b: number): number => {
    const { params: p, mode: m, sourceIndex: si } = previewInputs.current;
    const n = p.sources.length;
    if (n <= 0) return 0;
    if (m === "weave") return Math.floor(b / weaveFramesRef.current) % n;
    return clamp(si, 0, n - 1);
  };

  const clearPrefetch = () => {
    for (const { frame } of prefetchRef.current.values()) {
      void releaseFrames(rawFrameIds([frame]));
    }
    prefetchRef.current.clear();
    prefetchInflightRef.current.clear();
    prefetchGenRef.current++;
  };

  const startPrefetch = (f: number) => {
    const { params: p } = previewInputs.current;
    const src = shownIndexAt(f);
    const gen = prefetchGenRef.current;
    prefetchInflightRef.current.add(f);
    render(p, {
      composite: true,
      infoBox: true,
      position: f,
      watermark: false,
      raw: true,
      cancelGroup: "preview:prefetch",
      cancelSeq: gen,
      sources: [src],
    })
      .then((out) => {
        const frame = out.frames[0];
        if (!mountedRef.current || prefetchGenRef.current !== gen || !frame) {
          if (out.frames.length) void releaseFrames(rawFrameIds(out.frames));
          return;
        }
        prefetchRef.current.set(f, {
          frame,
          canvasW: out.canvasW,
          canvasH: out.canvasH,
          sourceIdx: src,
        });
      })
      .catch(() => {})
      .finally(() => {
        prefetchInflightRef.current.delete(f);
        pumpPrefetch();
      });
  };

  const pumpPrefetch = () => {
    if (!playingRef.current) return;
    const { mode: m, base: b } = previewInputs.current;
    if (m !== "single" && m !== "weave") return clearPrefetch();
    for (const key of [...prefetchRef.current.keys()]) {
      if (key <= b) {
        const entry = prefetchRef.current.get(key);
        if (entry) void releaseFrames(rawFrameIds([entry.frame]));
        prefetchRef.current.delete(key);
      }
    }
    const hi = Math.min(maxBaseRef.current, b + PREFETCH_WINDOW);
    for (let f = b + 1; f <= hi; f++) {
      if (prefetchInflightRef.current.size >= PREFETCH_CONCURRENCY) break;
      if (prefetchRef.current.has(f) || prefetchInflightRef.current.has(f)) continue;
      startPrefetch(f);
    }
  };

  const spliceSolo = (
    frame: SourceOut,
    canvasW: number,
    canvasH: number,
    solo: number,
    total: number,
  ): boolean => {
    const prev = previewSourcesRef.current;
    if (!frame || prev.length !== total) return false;
    const next = prev.slice();
    const replaced = next[solo];
    next[solo] = frame;
    if (replaced) void releaseFrames(rawFrameIds([replaced]));
    previewSourcesRef.current = next;
    stagedRef.current = rawFrameIds(next);
    setPreview({ index: 0, sources: next, canvasW, canvasH });
    setError(null);
    if (solo !== displayIndexRef.current && solo === shownIndexAt(previewInputs.current.base)) {
      pendingRevealRef.current = { index: solo, src: frame.src };
    }
    return true;
  };

  const pumpPreview = () => {
    const { base: b, params: p, ready: rdy, active: act, mode: m } = previewInputs.current;
    if (!rdy || !act) return;
    if (previewBusyRef.current) {
      previewDirtyRef.current = true;
      return;
    }
    const total = p.sources.length;
    const shown = shownIndexAt(b);
    const solo =
      playingRef.current &&
      (m === "single" || m === "weave") &&
      shown >= 0 &&
      shown < total &&
      previewSourcesRef.current.length === total
        ? shown
        : null;

    if (solo != null) {
      const cached = prefetchRef.current.get(b);
      if (cached && cached.sourceIdx === solo) {
        prefetchRef.current.delete(b);
        if (!spliceSolo(cached.frame, cached.canvasW, cached.canvasH, solo, total)) {
          void releaseFrames(rawFrameIds([cached.frame]));
        }
        pumpPrefetch();
        advancePlayRef.current();
        return;
      }
    }

    previewBusyRef.current = true;
    previewDirtyRef.current = false;
    const seq = ++seqRef.current;
    setLoading(true);
    render(p, {
      composite: true,
      infoBox: true,
      position: b,
      watermark: false,
      raw: true,
      cancelGroup: "preview:tab",
      cancelSeq: seq,
      ...(solo != null && { sources: [solo] }),
    })
      .then((out) => {
        const ids = rawFrameIds(out.frames);
        if (!mountedRef.current || !previewInputs.current.ready) {
          if (ids.length) void releaseFrames(ids);
          return;
        }
        if (solo != null) {
          if (!spliceSolo(out.frames[0], out.canvasW, out.canvasH, solo, p.sources.length)) {
            if (ids.length) void releaseFrames(ids);
            previewDirtyRef.current = true;
          }
          return;
        }
        if (stagedRef.current.length) void releaseFrames(stagedRef.current);
        stagedRef.current = ids;
        previewSourcesRef.current = out.frames;
        setPreview({ index: 0, sources: out.frames, canvasW: out.canvasW, canvasH: out.canvasH });
        setError(null);
        if (m === "weave") {
          const shownIdx = shownIndexAt(b);
          if (shownIdx !== displayIndexRef.current && out.frames[shownIdx]) {
            pendingRevealRef.current = { index: shownIdx, src: out.frames[shownIdx].src };
          } else if (shownIdx === displayIndexRef.current) {
            pendingRevealRef.current = null;
          }
        }
      })
      .catch((e) => {
        if (!mountedRef.current || String(e).includes("render superseded")) return;
        setError(String(e));
      })
      .finally(() => {
        previewBusyRef.current = false;
        if (mountedRef.current) setLoading(false);
        if (previewDirtyRef.current) pumpPreview();
        else {
          advancePlayRef.current();
          pumpPrefetch();
        }
      });
  };

  useEffect(() => {
    advancePlayRef.current = () => {
      if (!playingRef.current) return;
      if (previewInputs.current.base >= maxBaseRef.current) {
        setPlaying(false);
        return;
      }
      const scheduleNext = () => {
        if (!playingRef.current) return;
        const wait = Math.max(
          0,
          frameIntervalRef.current - (performance.now() - lastAdvanceRef.current),
        );
        clearPlayTimer();
        playTimerRef.current = window.setTimeout(() => {
          playTimerRef.current = null;
          if (!playingRef.current) return;
          lastAdvanceRef.current = performance.now();
          setBase((b) => clamp(b + 1, 0, maxBaseRef.current));
        }, wait);
      };
      const shown = previewSourcesRef.current[shownIndexAt(previewInputs.current.base)];
      if (!shown) return scheduleNext();
      let settled = false;
      const once = () => {
        if (settled) return;
        settled = true;
        scheduleNext();
      };
      decodeFrame(shown)
        .then((bmp) => {
          bmp.close();
          once();
        })
        .catch(once);
    };
  });
  const togglePlay = useCallback(() => {
    if (!playingRef.current && previewInputs.current.base >= maxBaseRef.current) setBase(0);
    setPlaying((p) => !p);
  }, [setBase]);
  const wasPlayingRef = useRef(false);
  useEffect(() => {
    if (playing) {
      wasPlayingRef.current = true;
      lastAdvanceRef.current = performance.now();
      if (!previewBusyRef.current) advancePlayRef.current();
      pumpPrefetch();
      return () => clearPlayTimer();
    }
    clearPlayTimer();
    clearPrefetch();
    if (wasPlayingRef.current) {
      wasPlayingRef.current = false;
      pumpPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);
  const canPlay = ready && active && maxBase > 0;
  const [prevCanPlay, setPrevCanPlay] = useState(canPlay);
  if (canPlay !== prevCanPlay) {
    setPrevCanPlay(canPlay);
    if (!canPlay) setPlaying(false);
  }

  useEffect(() => {
    const gated = mode === "weave" || (playing && mode === "single");
    if (!gated) {
      pendingRevealRef.current = null;
      setDisplayIndex(shownIndexAt(base));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, sourceIndex, playing, mode, weaveFrames, sourceCount]);

  useEffect(() => {
    clearPrefetch();
    pendingRevealRef.current = null;
    if (mode === "weave" || (playing && mode === "single")) pumpPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, weaveFrames]);

  useEffect(() => {
    if (!ready) {
      setPreview(null);
      previewSourcesRef.current = [];
      return;
    }
    pumpPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, paramsKey, ready, active]);

  useEffect(() => {
    if (playing && mode === "single") {
      pendingRevealRef.current = null;
      clearPrefetch();
      pumpPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceIndex]);

  return {
    preview,
    loading,
    error,
    displayIndex,
    onLayerPainted,
    currentFrame,
    playing,
    togglePlay,
  };
}
