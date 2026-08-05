import { useEffect, useRef, useState } from "react";
import { rawFrameIds } from "@/lib/utils";
import {
  render,
  releaseFrames,
  type Comparison,
  type DataUrl,
  type GenParams,
  type ProjectFrame,
  type SourceIndex,
} from "@/lib/tauri";

const THUMB_WIDTH = 260;
const EMPTY_THUMBS: Record<ProjectFrame, DataUrl> = {};

type Options = {
  params: GenParams;
  frameKey: string;
  ready: boolean;
  initializing: boolean;
  selectedIndex: number;
  currentPos: number | undefined;
  comparisons: number[];
  sourceIndex: number;
};

export function usePreviewRender({
  params,
  frameKey,
  ready,
  initializing,
  selectedIndex,
  currentPos,
  comparisons,
  sourceIndex,
}: Options) {
  const [preview, setPreview] = useState<Comparison | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [thumbState, setThumbState] = useState<{ key: string; byPos: Record<ProjectFrame, DataUrl> }>(
    { key: frameKey, byPos: {} },
  );

  const previewToken = useRef(0);
  const previewStagedRef = useRef<number[]>([]);
  useEffect(() => {
    if (!ready || initializing || currentPos == null) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    const token = ++previewToken.current;
    setPreviewLoading(true);
    const t = setTimeout(async () => {
      try {
        const out = await render(params, {
          composite: true,
          infoBox: true,
          position: currentPos,
          watermark: params.watermark,
          raw: true,
          cancelGroup: "preview:app",
          cancelSeq: token,
        });
        const ids = rawFrameIds(out.frames);
        if (token === previewToken.current) {
          if (previewStagedRef.current.length) void releaseFrames(previewStagedRef.current);
          previewStagedRef.current = ids;
          setPreview({ index: selectedIndex, sources: out.frames, canvasW: out.canvasW, canvasH: out.canvasH });
          setPreviewError(null);
        } else if (ids.length) {
          void releaseFrames(ids);
        }
      } catch (e) {
        if (String(e).includes("render superseded")) return;
        if (token === previewToken.current) {
          setPreview(null);
          setPreviewError(String(e));
        }
      } finally {
        if (token === previewToken.current) setPreviewLoading(false);
      }
    }, 140);
    return () => clearTimeout(t);
  }, [frameKey, selectedIndex, ready, initializing, params, currentPos]);

  const thumbToken = useRef(0);
  const thumbsRef = useRef<Record<SourceIndex, Record<ProjectFrame, DataUrl>>>({});
  const thumbGenRef = useRef(0);
  const thumbGenKeyRef = useRef("");
  const thumbCacheKeyRef = useRef(frameKey);
  useEffect(() => {
    if (!ready) return;
    if (thumbCacheKeyRef.current !== frameKey) {
      thumbCacheKeyRef.current = frameKey;
      thumbsRef.current = {};
    }
    const token = ++thumbToken.current;
    const cache = (thumbsRef.current[sourceIndex] ??= {});
    setThumbState({ key: frameKey, byPos: { ...cache } });
    const t = setTimeout(() => {
      // Same generation = all cells share one flag (they must not cancel each other).
      if (thumbGenKeyRef.current !== frameKey) {
        thumbGenKeyRef.current = frameKey;
        thumbGenRef.current++;
      }
      const gen = thumbGenRef.current;
      for (const pos of comparisons) {
        if (cache[pos]) continue;
        render(params, {
          sources: [sourceIndex],
          position: pos,
          maxW: THUMB_WIDTH,
          cancelGroup: "thumbs:app",
          cancelSeq: gen,
        })
          .then((out) => {
            if (token !== thumbToken.current) return;
            cache[pos] = out.frames[0].src;
            setThumbState({ key: frameKey, byPos: { ...cache } });
          })
          .catch(() => {});
      }
    }, 200);
    return () => clearTimeout(t);
  }, [frameKey, comparisons, ready, params, sourceIndex]);

  const thumbs = thumbState.key === frameKey ? thumbState.byPos : EMPTY_THUMBS;

  return { preview, previewLoading, previewError, thumbs };
}
