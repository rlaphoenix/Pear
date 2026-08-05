import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  Copy,
  FileCode2,
  Film,
  Heart,
  HelpCircle,
  ImageDown,
  Minus,
  MonitorPlay,
  Settings,
  Square,
  X,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cn } from "@/lib/utils";
import { TopTabs } from "@/components/primitives/tabs";
import { UpdateChecker, type UpdateState } from "@/components/UpdateChecker";
import { PreviewModeToggle } from "@/components/PreviewModeToggle";
import { openUrl, type TabId } from "@/lib/tauri";
import { type PreviewMode } from "@/lib/preview";

type Props = {
  tab: TabId;
  setTab: Dispatch<SetStateAction<TabId>>;
  ready: boolean;
  initializing: boolean;
  updateState: UpdateState;
  updateVersion?: string;
  onOpenUpdate: () => void;
  previewMode: PreviewMode;
  setPreviewMode: Dispatch<SetStateAction<PreviewMode>>;
  onAbout: () => void;
  onSettings: () => void;
};

export function TitleBar({
  tab,
  setTab,
  ready,
  initializing,
  updateState,
  updateVersion,
  onOpenUpdate,
  previewMode,
  setPreviewMode,
  onAbout,
  onSettings,
}: Props) {
  return (
    <TopTabs
      value={tab}
      onChange={(id) => setTab(id as TabId)}
      left={
        <div
          data-tauri-drag-region=""
          className="flex select-none items-center gap-2 pl-3 pr-4"
        >
          <img src="/pear.png" alt="" className="pointer-events-none h-6 w-auto" />
          <span className="pointer-events-none text-sm font-semibold leading-none text-foreground">
            Pear
          </span>
        </div>
      }
      tabs={[
        { id: "sources", label: "Sources", icon: <Film className="size-4" />, disabled: !ready || initializing },
        { id: "editor", label: "Editor", icon: <FileCode2 className="size-4" />, disabled: !ready || initializing },
        { id: "preview", label: "Preview", icon: <MonitorPlay className="size-4" />, disabled: !ready || initializing },
        { id: "export", label: "Export", icon: <ImageDown className="size-4" />, disabled: !ready || initializing },
      ]}
      right={
        <div className="flex items-center gap-2">
          <UpdateChecker
            state={updateState}
            version={updateVersion}
            onOpen={onOpenUpdate}
          />
        </div>
      }
      rightFlush={
        <div className="flex items-stretch">
          <PreviewModeToggle mode={previewMode} setMode={setPreviewMode} />
          <button
            type="button"
            onClick={() => void openUrl("https://ko-fi.com/rlaphoenix").catch(() => {})}
            title="Donate"
            className="flex items-center justify-center border-l border-border px-3 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground"
          >
            <Heart className="size-4" />
          </button>
          <button
            type="button"
            onClick={onAbout}
            title="About"
            className="flex items-center justify-center border-l border-border px-3 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground"
          >
            <HelpCircle className="size-4" />
          </button>
          <button
            type="button"
            onClick={onSettings}
            title="Settings"
            className="flex items-center justify-center border-l border-border px-3 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground"
          >
            <Settings className="size-4" />
          </button>
          <ControlBox />
        </div>
      }
    />
  );
}

const BTN =
  "flex items-center justify-center border-l border-border px-3 text-muted-foreground outline-none transition-colors";

function ControlBox() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    let win: ReturnType<typeof getCurrentWindow>;
    try {
      win = getCurrentWindow();
    } catch {
      return;
    }
    void win.isMaximized().then(setMaximized).catch(() => {});
    let unlisten: (() => void) | undefined;
    win
      .onResized(() => void win.isMaximized().then(setMaximized).catch(() => {}))
      .then((u) => {
        unlisten = u;
      })
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  const minimize = useCallback(() => {
    try {
      void getCurrentWindow().minimize();
    } catch {
      /* not a Tauri context */
    }
  }, []);
  const toggleMaximize = useCallback(async () => {
    try {
      const win = getCurrentWindow();
      if (await win.isMaximized()) await win.unmaximize();
      else await win.maximize();
    } catch {
      /* not a Tauri context */
    }
  }, []);
  const close = useCallback(() => {
    try {
      void getCurrentWindow().close();
    } catch {
      /* not a Tauri context */
    }
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={minimize}
        title="Minimize"
        className={cn(BTN, "hover:bg-accent hover:text-foreground")}
      >
        <Minus className="size-4" />
      </button>
      <button
        type="button"
        onClick={toggleMaximize}
        title={maximized ? "Restore" : "Maximize"}
        className={cn(BTN, "hover:bg-accent hover:text-foreground")}
      >
        {maximized ? (
          <Copy className="size-3.5 -scale-x-100" />
        ) : (
          <Square className="size-3.5" />
        )}
      </button>
      <button
        type="button"
        onClick={close}
        title="Close Pear"
        className={cn(BTN, "hover:bg-red-600 hover:text-white")}
      >
        <X className="size-[18px]" />
      </button>
    </>
  );
}
