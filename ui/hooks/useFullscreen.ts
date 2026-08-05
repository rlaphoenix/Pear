import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppSettings, FullscreenIncludes, TabId } from "@/lib/tauri";

export const INCLUDES: [keyof FullscreenIncludes, string][] = [
  ["tabs", "Tabs"],
  ["framestrip", "Frame-strip"],
  ["seekbar", "Seek-bar"],
  ["timeline", "Timeline"],
  ["markup", "Markup tools (Export)"],
];

type Options = {
  fullscreen: boolean;
  setFullscreen: Dispatch<SetStateAction<boolean>>;
  fullscreenMode: AppSettings["fullscreenMode"];
  tab: TabId;
};

export function useFullscreen({ fullscreen, setFullscreen, fullscreenMode, tab }: Options) {
  const maximizedByUs = useRef(false);
  useEffect(() => {
    let win: ReturnType<typeof getCurrentWindow>;
    try {
      win = getCurrentWindow();
    } catch {
      return;
    }
    const mode = fullscreenMode;
    let cancelled = false;
    void (async () => {
      try {
        await win.setFullscreen(fullscreen && mode === "fullscreen");
        if (cancelled) return;
        if (fullscreen && mode === "maximized") {
          if (!(await win.isMaximized())) {
            maximizedByUs.current = true;
            await win.maximize();
          }
        } else if (maximizedByUs.current) {
          maximizedByUs.current = false;
          await win.unmaximize();
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [fullscreen, fullscreenMode]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFullscreen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, setFullscreen]);

  const canFullscreen = tab === "preview" || tab === "export";
  useEffect(() => {
    if (!canFullscreen && fullscreen) setFullscreen(false);
  }, [canFullscreen, fullscreen, setFullscreen]);

  useEffect(() => {
    if (!canFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        setFullscreen((f) => !f);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canFullscreen, setFullscreen]);
}
