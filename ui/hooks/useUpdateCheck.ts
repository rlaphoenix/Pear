import { useCallback, useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { type UpdateState } from "@/components/UpdateChecker";
import { isPortable } from "@/lib/tauri";

const REPO = "rlaphoenix/pear";
const IGNORE_KEY = "pear.ignoredUpdate";
const LAST_CHECK_KEY = "pear.lastUpdateCheck";
const DAY_MS = 24 * 60 * 60 * 1000;

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  url: string;
  downloadUrl: string;
}

function parseVersion(v: string): number[] {
  return v.replace(/^v/i, "").split(/[.-]/).map((p) => parseInt(p, 10) || 0);
}

function isNewer(a: string, b: string): boolean {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

export function useUpdateCheck(enabled: boolean) {
  const [updateState, setUpdateState] = useState<UpdateState>("hidden");
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [portable, setPortable] = useState(false);
  const handleRef = useRef<Update | null>(null);
  const didCheck = useRef(false);

  useEffect(() => {
    isPortable().then(setPortable).catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled) {
      didCheck.current = false;
      if (handleRef.current) {
        void handleRef.current.close().catch(() => {});
        handleRef.current = null;
      }
      setUpdateState("hidden");
      setUpdateModalOpen(false);
      return;
    }
    if (didCheck.current) return;
    didCheck.current = true;
    let last = 0;
    try {
      last = parseInt(localStorage.getItem(LAST_CHECK_KEY) ?? "", 10) || 0;
    } catch {
    }
    const elapsed = Date.now() - last;
    if (last && elapsed >= 0 && elapsed < DAY_MS) {
      setUpdateState("hidden");
      return;
    }
    let cancelled = false;
    setUpdateState("checking");
    void (async () => {
      try {
        const found = await check();
        try {
          localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
        } catch {
        }
        if (cancelled) {
          if (found) await found.close().catch(() => {});
          return;
        }
        if (!found) {
          setUpdateState("hidden");
          return;
        }
        let ignored = "";
        try {
          ignored = localStorage.getItem(IGNORE_KEY) ?? "";
        } catch {
        }
        if (ignored !== "" && !isNewer(found.version, ignored)) {
          await found.close().catch(() => {});
          if (!cancelled) setUpdateState("hidden");
          return;
        }
        handleRef.current = found;
        setUpdate({
          version: found.version,
          currentVersion: found.currentVersion,
          url: `https://github.com/${REPO}/releases/tag/v${found.version}`,
          downloadUrl: `https://github.com/${REPO}/releases/download/v${found.version}/Pear_${found.version}_x64-portable.exe`,
        });
        setUpdateState("available");
        setUpdateModalOpen(true);
      } catch {
        if (!cancelled) setUpdateState("hidden");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const install = useCallback(
    async (onProgress?: (fraction: number | null) => void): Promise<void> => {
      const handle = handleRef.current;
      if (!handle) throw new Error("no update available");
      let total = 0;
      let downloaded = 0;
      await handle.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            total = event.data.contentLength ?? 0;
            onProgress?.(total > 0 ? 0 : null);
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            onProgress?.(total > 0 ? downloaded / total : null);
            break;
          case "Finished":
            onProgress?.(1);
            break;
        }
      });
      await relaunch();
    },
    [],
  );

  const ignore = useCallback((): void => {
    const handle = handleRef.current;
    if (handle) {
      try {
        localStorage.setItem(IGNORE_KEY, handle.version);
      } catch {
      }
      void handle.close().catch(() => {});
      handleRef.current = null;
    }
    setUpdateState("hidden");
    setUpdateModalOpen(false);
  }, []);

  return {
    updateState,
    setUpdateState,
    update,
    updateModalOpen,
    setUpdateModalOpen,
    updating,
    setUpdating,
    portable,
    install,
    ignore,
  };
}
