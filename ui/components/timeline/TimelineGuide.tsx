import { useEffect, useState } from "react";
import { render, type GenParams } from "@/lib/tauri";
import { GUIDE_PREVIEW_W, thumbCache } from "@/lib/timeline";

export function GuidePreview({
  params,
  paramsKey,
  source,
  frame,
  height,
  style,
}: {
  params: GenParams;
  paramsKey: string;
  source: number;
  frame: number;
  height: number;
  style: React.CSSProperties;
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
    const t = setTimeout(() => {
      render(params, { sources: [source], sourceFrame: frame, maxW: GUIDE_PREVIEW_W })
        .then((out) => {
          const u = out.frames[0].src;
          thumbCache.set(key, u);
          if (!stale) setUrl(u);
        })
        .catch(() => {});
    }, 60);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [key, params, source, frame]);
  return (
    <div
      className="pointer-events-none absolute z-50 overflow-hidden bg-[#0c0c0f]"
      style={{ ...style, height, maxWidth: GUIDE_PREVIEW_W }}
    >
      {url ? (
        <img src={url} alt="" draggable={false} className="block h-full w-auto" />
      ) : (
        <div className="flex h-full items-center justify-center px-3 text-[9px] text-muted-foreground/60">
          …
        </div>
      )}
      <span className="pointer-events-none absolute bottom-0.5 left-1 z-10 font-mono text-[9px] leading-none text-white [text-shadow:0_1px_2px_#000]">
        #{frame}
      </span>
    </div>
  );
}
