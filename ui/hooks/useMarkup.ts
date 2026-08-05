import { useCallback, useState } from "react";
import type { ProjectFrame } from "@/lib/tauri";
import {
  addAnnotation,
  clearMarkup,
  emptyMarkup,
  redo,
  undo,
  type Annotation,
  type MarkupState,
  type MarkupTool,
} from "@/lib/markup";

export function useMarkup(currentPos: number | undefined) {
  const [markups, setMarkups] = useState<Record<ProjectFrame, MarkupState>>({});
  const [tool, setTool] = useState<MarkupTool | null>(null);
  const [color, setColor] = useState("#ff3b3b");
  const [markupSize, setMarkupSize] = useState(0.005);

  const markupState = markups[currentPos ?? -1] ?? emptyMarkup();
  const setMarkupFor = useCallback(
    (pos: number | undefined, updater: (s: MarkupState) => MarkupState) => {
      if (pos == null) return;
      setMarkups((m) => ({ ...m, [pos]: updater(m[pos] ?? emptyMarkup()) }));
    },
    [],
  );
  const onAddAnnotation = useCallback(
    (a: Annotation) => setMarkupFor(currentPos, (s) => addAnnotation(s, a)),
    [currentPos, setMarkupFor],
  );
  const onUndo = useCallback(() => setMarkupFor(currentPos, undo), [currentPos, setMarkupFor]);
  const onRedo = useCallback(() => setMarkupFor(currentPos, redo), [currentPos, setMarkupFor]);
  const onClear = useCallback(() => setMarkupFor(currentPos, clearMarkup), [currentPos, setMarkupFor]);

  return {
    markups,
    markupState,
    tool,
    setTool,
    color,
    setColor,
    size: markupSize,
    setSize: setMarkupSize,
    onAddAnnotation,
    onUndo,
    onRedo,
    onClear,
  };
}
