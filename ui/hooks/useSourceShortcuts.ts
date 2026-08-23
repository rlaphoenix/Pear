import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { SourceId, TabId } from "@/lib/tauri";
import type { UiSource } from "@/state/AppState";

interface Args {
  tab: TabId;
  sources: UiSource[];
  readyCount: number;
  setSourcePage: Dispatch<SetStateAction<SourceId>>;
  setSourceIndex: Dispatch<SetStateAction<number>>;
}

export function useSourceShortcuts({
  tab,
  sources,
  readyCount,
  setSourcePage,
  setSourceIndex,
}: Args) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      if (!m) return;
      const el = e.target as HTMLElement | null;
      if (el && (/INPUT|TEXTAREA|SELECT/.test(el.tagName) || el.isContentEditable)) return;
      const i = Number(m[1]) - 1;
      if (tab === "sources") {
        const s = sources[i];
        if (!s) return;
        e.preventDefault();
        setSourcePage(s.id);
      } else if (i < readyCount) {
        e.preventDefault();
        setSourceIndex(i);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, sources, readyCount, setSourcePage, setSourceIndex]);
}
