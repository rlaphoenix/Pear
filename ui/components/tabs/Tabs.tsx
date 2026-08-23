import { type Dispatch, type RefObject, type SetStateAction } from "react";
import { SourcesTab } from "@/components/tabs/sources/SourcesTab";
import { PreviewTab, type PreviewTabHandle } from "@/components/tabs/preview/PreviewTab";
import { Timeline } from "@/components/Timeline";
import { WelcomeView } from "@/components/views/WelcomeView";
import { LoadingView } from "@/components/views/LoadingView";
import { cn } from "@/lib/utils";
import {
  type AppSettings,
  type Comparison,
  type DataUrl,
  type GenParams,
  type ProjectFrame,
  type RecentProject,
  type SaveProgress,
  type SourceId,
  type TabId,
} from "@/lib/tauri";
import { type useIndexingStatus } from "@/hooks/useIndexingStatus";
import { type UiSource } from "@/state/AppState";
import { type useMarkup } from "@/hooks/useMarkup";
import { type useComparisonsResize } from "@/hooks/useComparisonsResize";
import { ExportTab } from "@/components/tabs/export/ExportTab";

type Props = {
  sources: UiSource[];
  hasAnySource: boolean;
  tab: TabId;
  fullscreen: boolean;
  appSettings: AppSettings;
  params: GenParams;
  frameKey: string;
  ready: boolean;
  initializing: boolean;
  indexingStatus: ReturnType<typeof useIndexingStatus>;
  loadDetail: string | null;
  previewRef: RefObject<PreviewTabHandle | null>;
  onAddCurrentComparison: () => void;
  scriptFor: (id: SourceId) => string;
  setScripts: Dispatch<SetStateAction<Record<SourceId, string>>>;
  onAddSources: () => void;
  onLoadProject: () => void;
  recents: RecentProject[];
  onOpenRecent: (path: string) => void;
  onRemoveRecent: (path: string) => void;
  preview: Comparison | null;
  previewLoading: boolean;
  previewError: string | null;
  markup: ReturnType<typeof useMarkup>;
  onExport: () => void;
  onShare: () => void;
  exportProgress: SaveProgress | null;
  resize: ReturnType<typeof useComparisonsResize>;
  comparisons: number[];
  thumbs: Record<ProjectFrame, DataUrl>;
  selectedIndex: number;
  onSelect: (i: number) => void;
  onAdd: () => void;
  onDelete: (index: number) => void;
  onDeleteSelected: (positions: number[]) => void;
  onRerollSelected: (positions: number[]) => void;
};

export function Tabs({
  sources,
  hasAnySource,
  tab,
  fullscreen,
  appSettings,
  params,
  frameKey,
  ready,
  initializing,
  indexingStatus,
  loadDetail,
  previewRef,
  onAddCurrentComparison,
  scriptFor,
  setScripts,
  onAddSources,
  onLoadProject,
  recents,
  onOpenRecent,
  onRemoveRecent,
  preview,
  previewLoading,
  previewError,
  markup,
  onExport,
  onShare,
  exportProgress,
  resize,
  comparisons,
  thumbs,
  selectedIndex,
  onSelect,
  onAdd,
  onDelete,
  onDeleteSelected,
  onRerollSelected,
}: Props) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1">
        {sources.length === 0 ? (
          <WelcomeView
            onAddSources={onAddSources}
            onLoadProject={onLoadProject}
            recents={recents}
            onOpenRecent={onOpenRecent}
            onRemoveRecent={onRemoveRecent}
          />
        ) : (
          <>
            <div className={tab === "sources" ? "h-full" : "hidden"}>
              <SourcesTab
                scriptFor={scriptFor}
                setScript={(id, s) => setScripts((p) => ({ ...p, [id]: s }))}
              />
            </div>

            <div className={tab === "preview" ? "h-full" : "hidden"}>
              <PreviewTab
                ref={previewRef}
                params={params}
                ready={ready && !initializing}
                active={tab === "preview"}
                onAddComparison={onAddCurrentComparison}
              />
            </div>

            <div className={tab === "export" ? "flex h-full" : "hidden"}>
              <ExportTab
                preview={preview}
                previewLoading={previewLoading}
                hasSources={ready && !initializing}
                previewError={previewError}
                markup={markup}
                onExport={onExport}
                onShare={onShare}
                exportProgress={exportProgress}
                resize={resize}
                framestripHidden={fullscreen && !appSettings.fullscreenIncludes.framestrip}
                comparisons={comparisons}
                thumbs={thumbs}
                selectedIndex={selectedIndex}
                onSelect={onSelect}
                onAdd={onAdd}
                onDelete={onDelete}
                onDeleteSelected={onDeleteSelected}
                onRerollSelected={onRerollSelected}
              />
            </div>
          </>
        )}
      </div>

      {hasAnySource && (
        <div
          className={cn(
            "shrink-0",
            (tab !== "preview" ||
              (fullscreen && !appSettings.fullscreenIncludes.timeline)) &&
              "hidden",
          )}
        >
          <Timeline params={params} paramsKey={frameKey} active={tab === "preview"} />
        </div>
      )}

      <LoadingView initializing={initializing} indexing={indexingStatus} detail={loadDetail} />
    </div>
  );
}
