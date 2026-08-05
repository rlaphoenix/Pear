import { useEffect, useState } from "react";
import { render, type GenParams } from "@/lib/tauri";
import { thumbCache } from "@/lib/timeline";

export function SegThumb({
  params,
  paramsKey,
  source,
  frame,
}: {
  params: GenParams;
  paramsKey: string;
  source: number;
  frame: number;
}) {
  const key = `${paramsKey}|${source}|${frame}`;
  const [url, setUrl] = useState<string | null>(() => thumbCache.get(key) ?? null);
  useEffect(() => {
    const hit = thumbCache.get(key);
    if (hit) {
      setUrl(hit);
      return;
    }
    let stale = false;
    render(params, { sources: [source], sourceFrame: frame, maxW: 200 })
      .then((out) => {
        const u = out.frames[0].src;
        thumbCache.set(key, u);
        if (!stale) setUrl(u);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [key, params, source, frame]);
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      className="pointer-events-none absolute inset-y-0 left-0 h-full w-auto max-w-none object-cover opacity-60"
    />
  );
}
