import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { toast } from "@/lib/toast";
import { decodeFrame } from "@/lib/utils";
import { takePendingProject, type SourceId, type TabId } from "@/lib/tauri";
import { PROJECT_EXT, type UiSource } from "@/state/AppState";
import { type PreviewTabHandle } from "@/components/tabs/preview/PreviewTab";
import { type PreviewMode } from "@/lib/preview";

type Options = {
  ready: boolean;
  dirty: boolean;
  projectPath: string | null;
  projectName: string;
  readySources: UiSource[];
  closeProject: () => Promise<void> | void;
  setFullscreen: Dispatch<SetStateAction<boolean>>;
  saveProject: (path: string, name: string, thumbnail?: string) => Promise<unknown>;
  prefsReady: boolean;
  saveUiState: (tab: string, previewMode: string, base: number) => void;
  setScripts: Dispatch<SetStateAction<Record<SourceId, string>>>;
  beginOpen: (path: string, silent?: boolean) => Promise<void>;
  previewRef: RefObject<PreviewTabHandle | null>;
  tab: TabId;
  previewMode: PreviewMode;
  base: number;
};

export function useProjectLifecycle({
  ready,
  dirty,
  projectPath,
  projectName,
  readySources,
  closeProject,
  setFullscreen,
  saveProject,
  prefsReady,
  saveUiState,
  setScripts,
  beginOpen,
  previewRef,
  tab,
  previewMode,
  base,
}: Options) {
  const persistUi = useRef(false);
  const allowCloseRef = useRef(false);
  const afterSaveRef = useRef<null | "close" | "quit">(null);

  const [saveName, setSaveName] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);

  const onCloseProject = useCallback(() => {
    void closeProject();
    setScripts({});
    setFullscreen(false);
  }, [closeProject, setScripts, setFullscreen]);

  const requestCloseProject = useCallback(() => {
    if (dirty) setConfirmClose(true);
    else onCloseProject();
  }, [dirty, onCloseProject]);

  const quitApp = useCallback(() => {
    setConfirmQuit(false);
    allowCloseRef.current = true;
    try {
      void getCurrentWindow().close();
    } catch {
    }
  }, []);

  const hasUnsaved = ready && dirty;
  const hasUnsavedRef = useRef(hasUnsaved);
  useEffect(() => {
    hasUnsavedRef.current = hasUnsaved;
  });

  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || !prefsReady) return;
    autoOpened.current = true;
    void (async () => {
      let launch: string | null = null;
      try {
        launch = await takePendingProject();
      } catch {
      }
      if (launch) void beginOpen(launch);
      else persistUi.current = true;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsReady]);

  useEffect(() => {
    const un = listen<string>("open-project", (e) => {
      if (e.payload) void beginOpen(e.payload);
    });
    return () => {
      void un.then((f) => f());
    };
  }, [beginOpen]);

  const wasReady = useRef(false);
  useEffect(() => {
    if (ready && !wasReady.current) {
      persistUi.current = true;
    }
    wasReady.current = ready;
  }, [ready]);

  useEffect(() => {
    if (!persistUi.current) return;
    const t = setTimeout(() => saveUiState(tab, previewMode, base), 400);
    return () => clearTimeout(t);
  }, [tab, previewMode, base, saveUiState]);

  const deriveName = useCallback(() => {
    const stem = (p: string | null) =>
      p?.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") ?? "";
    const names = readySources.flatMap((s) => {
      const name = stem(s.path);
      return name ? [name] : [];
    });
    return names.length ? names.join(" vs ") : "Comparison";
  }, [readySources]);

  const generateProjectThumbnail = useCallback(async () => {
    const frame = previewRef.current?.getFrame() ?? null;
    if (!frame) return "";
    try {
      const bmp = await decodeFrame(frame);
      const scale = Math.min(1, 160 / frame.w, 90 / frame.h);
      const w = Math.max(1, Math.round(frame.w * scale));
      const h = Math.max(1, Math.round(frame.h * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
      bmp.close();
      return canvas.toDataURL("image/jpeg", 0.75);
    } catch {
      return "";
    }
  }, [previewRef]);

  const runAfterSave = useCallback(() => {
    const action = afterSaveRef.current;
    afterSaveRef.current = null;
    if (action === "close") onCloseProject();
    else if (action === "quit") quitApp();
  }, [onCloseProject, quitApp]);

  const saveProjectTo = useCallback(
    async (path: string, name: string) => {
      try {
        const thumb = await generateProjectThumbnail();
        await saveProject(path, name, thumb);
        toast({ kind: "success", msg: "Project saved" });
        runAfterSave();
      } catch (e) {
        afterSaveRef.current = null;
        toast({ kind: "error", msg: `Save failed: ${String(e)}` });
      }
    },
    [saveProject, generateProjectThumbnail, runAfterSave],
  );

  const onSaveProject = useCallback(async () => {
    if (projectPath) await saveProjectTo(projectPath, projectName || deriveName());
    else setSaveName(deriveName());
  }, [projectPath, projectName, deriveName, saveProjectTo]);

  const confirmSaveName = useCallback(async () => {
    const name = (saveName ?? "").trim() || deriveName();
    setSaveName(null);
    const chosen = await save({
      title: "Save project",
      defaultPath: `${name}.${PROJECT_EXT}`,
      filters: [{ name: "Pear Compare Project", extensions: [PROJECT_EXT] }],
    });
    if (typeof chosen !== "string") {
      afterSaveRef.current = null;
      return;
    }
    await saveProjectTo(chosen, name);
  }, [saveName, deriveName, saveProjectTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "w" || e.key === "W")) {
        e.preventDefault();
        if (ready) requestCloseProject();
        else quitApp();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready, requestCloseProject, quitApp]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onCloseRequested((event) => {
        if (allowCloseRef.current) return;
        if (!hasUnsavedRef.current) return;
        event.preventDefault();
        setConfirmQuit(true);
      })
      .then((u) => {
        unlisten = u;
      })
      .catch(() => {
      });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        if (ready) void onSaveProject();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready, onSaveProject]);

  return {
    onSaveProject,
    onCloseProject,
    quitApp,
    afterSaveRef,
    saveName,
    setSaveName,
    confirmSaveName,
    confirmClose,
    setConfirmClose,
    confirmQuit,
    setConfirmQuit,
  };
}
