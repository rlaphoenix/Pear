import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import { frameAt, projectFrameOf } from "@/lib/frames";
import type { UiSource } from "@/state/AppState";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface KeyboardArgs {
  keyframes: number[];
  shownSource: UiSource | undefined;
  base: number;
  maxBase: number;
  setBase: Dispatch<SetStateAction<number>>;
  active: boolean;
  togglePlay: () => void;
}

export function usePreviewKeyboard({
  keyframes,
  shownSource,
  base,
  maxBase,
  setBase,
  active,
  togglePlay,
}: KeyboardArgs) {
  const jumpKeyframe = useCallback(
    (dir: 1 | -1) => {
      if (!keyframes.length) return;
      const segs = shownSource?.segments ?? [];
      const cur = frameAt(segs, base);
      if (cur == null) return;
      let target: number | undefined;
      if (dir > 0) target = keyframes.find((k) => k > cur);
      else {
        const prev = keyframes.filter((k) => k < cur);
        target = prev.length ? prev[prev.length - 1] : undefined;
      }
      if (target == null) return;
      const t = projectFrameOf(segs, target);
      if (t == null) return;
      setBase(clamp(t, 0, maxBase));
    },
    [keyframes, base, shownSource, maxBase, setBase],
  );

  const jumpSegment = useCallback(
    (dir: 1 | -1) => {
      const segs = shownSource?.segments ?? [];
      if (!segs.length) return;
      const bounds = new Set<number>();
      let lastFrame = 0;
      for (const s of segs) {
        bounds.add(clamp(s.pos, 0, maxBase));
        lastFrame = Math.max(lastFrame, s.pos + s.len - 1);
      }
      bounds.add(clamp(lastFrame, 0, maxBase));
      const sorted = [...bounds].sort((a, b) => a - b);
      const target =
        dir > 0
          ? sorted.find((b) => b > base)
          : [...sorted].reverse().find((b) => b < base);
      if (target != null) setBase(target);
    },
    [shownSource, base, maxBase, setBase],
  );

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && /INPUT|TEXTAREA|SELECT/.test(el.tagName)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowRight":
          e.preventDefault();
          if (ctrl) jumpSegment(1);
          else setBase((b) => clamp(b + 1, 0, maxBase));
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (ctrl) jumpSegment(-1);
          else setBase((b) => clamp(b - 1, 0, maxBase));
          break;
        case "ArrowUp":
          e.preventDefault();
          jumpKeyframe(1);
          break;
        case "ArrowDown":
          e.preventDefault();
          jumpKeyframe(-1);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, maxBase, jumpKeyframe, jumpSegment, togglePlay, setBase]);

  return { jumpKeyframe };
}
