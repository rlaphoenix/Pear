import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import { projectFrameOf } from "@/lib/frames";
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
  const seekTo = useCallback(
    (targets: Iterable<number>, dir: 1 | -1) => {
      const sorted = [...new Set(targets)].sort((a, b) => a - b);
      const target =
        dir > 0
          ? sorted.find((b) => b > base)
          : [...sorted].reverse().find((b) => b < base);
      if (target != null) setBase(target);
    },
    [base, setBase],
  );

  const jumpKeyframe = useCallback(
    (dir: 1 | -1) => {
      if (!keyframes.length) return;
      const segs = shownSource?.segments ?? [];
      if (!segs.length) return;
      let first = maxBase;
      let last = 0;
      for (const s of segs) {
        first = Math.min(first, clamp(s.pos, 0, maxBase));
        last = Math.max(last, clamp(s.pos + s.len - 1, 0, maxBase));
      }
      const targets = [first, last];
      for (const k of keyframes) {
        const t = projectFrameOf(segs, k);
        if (t != null) targets.push(clamp(t, 0, maxBase));
      }
      seekTo(targets, dir);
    },
    [keyframes, shownSource, maxBase, seekTo],
  );

  const jumpSegment = useCallback(
    (dir: 1 | -1) => {
      const segs = shownSource?.segments ?? [];
      if (!segs.length) return;
      const targets: number[] = [];
      let last = 0;
      for (const s of segs) {
        targets.push(clamp(s.pos, 0, maxBase));
        last = Math.max(last, s.pos + s.len - 1);
      }
      targets.push(clamp(last, 0, maxBase));
      seekTo(targets, dir);
    },
    [shownSource, maxBase, seekTo],
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

  return { jumpKeyframe, jumpSegment };
}
