import { useEffect, useRef, useState } from "react";
import { render, releaseFrames, type GenParams } from "@/lib/tauri";
import { rawFrameIds } from "@/lib/utils";

export interface WarmProgress {
  total: number;
  done: number;
}

const warmKey = (s: GenParams["sources"][number]) =>
  [s.path, s.deinterlace, s.deintKernel, s.deintDouble, s.tempoMode, s.tempoDecimator, s.tempoFps].join(
    "|",
  );

export function useSourceWarmup(params: GenParams, enabled: boolean): WarmProgress | null {
  const warmed = useRef(new Set<string>());
  const running = useRef(false);
  const paramsRef = useRef(params);
  const [progress, setProgress] = useState<WarmProgress | null>(null);
  useEffect(() => {
    paramsRef.current = params;
  });

  const sig = params.sources.map(warmKey).join("~");

  useEffect(() => {
    if (!enabled || running.current) return;
    const todo = paramsRef.current.sources
      .map((s, i) => ({ i, key: warmKey(s) }))
      .filter(({ key }) => !warmed.current.has(key));
    if (todo.length === 0) return;

    running.current = true;
    let cancelled = false;
    setProgress({ total: todo.length, done: 0 });
    (async () => {
      let done = 0;
      for (const { i, key } of todo) {
        if (cancelled) break;
        try {
          const out = await render(paramsRef.current, {
            composite: true,
            position: 0,
            raw: true,
            sources: [i],
          });
          void releaseFrames(rawFrameIds(out.frames));
          warmed.current.add(key);
        } catch {
        }
        done += 1;
        if (!cancelled) setProgress({ total: todo.length, done });
      }
      running.current = false;
      if (!cancelled) setProgress(null);
    })();

    return () => {
      cancelled = true;
      running.current = false;
    };
  }, [enabled, sig]);

  return progress;
}
