import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl, toggleDevtools } from "@/lib/tauri";

export function useGlobalShortcuts() {
  useEffect(() => {
    let win: ReturnType<typeof getCurrentWindow> | null = null;
    try {
      win = getCurrentWindow();
    } catch {
      return;
    }
    const raf = requestAnimationFrame(() => {
      void win?.show().catch(() => {});
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const r = e.key === "r" || e.key === "R";
      if (e.key === "F5" || ((e.ctrlKey || e.metaKey) && r)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== "F1") return;
      const el = e.target as HTMLElement;
      if (el && (/INPUT|TEXTAREA|SELECT/.test(el.tagName) || el.isContentEditable)) return;
      e.preventDefault();
      void openUrl("https://github.com/rlaphoenix/pear").catch(() => {});
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F12") return;
      e.preventDefault();
      void toggleDevtools().catch(() => {});
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
