import { useEffect, useState } from "react";
import { sourceKeyframes } from "@/lib/tauri";
import type { UiSource } from "@/state/AppState";

export function useSourceKeyframes(source: UiSource | undefined): number[] {
  const [keyframes, setKeyframes] = useState<number[]>([]);
  const kfPath = source?.path;
  const kfDeinterlace = source?.deinterlace;
  const kfDeintKernel = source?.deintKernel;
  const kfDeintDouble = source?.deintDouble;
  useEffect(() => {
    if (!kfPath) return setKeyframes([]);
    let stale = false;
    sourceKeyframes(kfPath, kfDeinterlace, kfDeintKernel, kfDeintDouble)
      .then((k) => !stale && setKeyframes(k))
      .catch(() => !stale && setKeyframes([]));
    return () => {
      stale = true;
    };
  }, [kfPath, kfDeinterlace, kfDeintKernel, kfDeintDouble]);
  return keyframes;
}
