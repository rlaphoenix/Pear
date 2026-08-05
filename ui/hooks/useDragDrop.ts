import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

// The `cancelled` guard tears down a listener that resolves after cleanup (e.g. React
// StrictMode's mount->unmount->remount in dev) - otherwise two listeners would each fire
// on a drop and every file would be added twice.
export function useDragDrop(addSources: (paths: string[]) => unknown) {
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    try {
      getCurrentWebview()
        .onDragDropEvent((event) => {
          const pl = event.payload;
          if (pl.type === "enter" || pl.type === "over") setDragOver(true);
          else if (pl.type === "leave") setDragOver(false);
          else if (pl.type === "drop") {
            setDragOver(false);
            const paths = pl.paths ?? [];
            if (paths.length) void addSources(paths);
          }
        })
        .then((u) => {
          if (cancelled) u();
          else unlisten = u;
        })
        .catch(() => {});
    } catch {
    }
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [addSources]);

  return dragOver;
}
