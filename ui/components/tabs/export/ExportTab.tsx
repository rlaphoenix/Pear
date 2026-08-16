import { type ReactNode } from "react";
import { ImageDown, ImageOff, Loader2, Share2 } from "lucide-react";
import { cn, splitSourceError, frameToCanvas, canvasToBlob } from "@/lib/utils";
import { renderMarkup } from "@/lib/markup";
import { useZoom } from "@/hooks/useZoom";
import { type Comparison, type DataUrl, type ProjectFrame, type SaveProgress } from "@/lib/tauri";
import type { PreviewMode } from "@/lib/preview";
import { MarkupToolbar } from "@/components/tabs/export/MarkupToolbar";
import { MarkupCanvas } from "@/components/tabs/export/MarkupCanvas";
import { PreviewStage } from "@/components/PreviewStage";
import { ComparisonsPane } from "@/components/tabs/export/ComparisonsPane";
import { ErrorBox } from "@/components/primitives/error-box";
import { useAppSettings } from "@/state/AppState";
import { usePreview } from "@/state/PreviewContext";
import { type useMarkup } from "@/hooks/useMarkup";
import { type useComparisonsResize } from "@/hooks/useComparisonsResize";

type Props = {
  preview: Comparison | null;
  previewLoading: boolean;
  hasSources: boolean;
  previewError: string | null;
  markup: ReturnType<typeof useMarkup>;
  onExport: () => void;
  onShare: () => void;
  exportProgress: SaveProgress | null;
  resize: ReturnType<typeof useComparisonsResize>;
  framestripHidden: boolean;
  comparisons: number[];
  thumbs: Record<ProjectFrame, DataUrl>;
  selectedIndex: number;
  onSelect: (i: number) => void;
  onAdd: () => void;
  onDelete: (index: number) => void;
  onDeleteSelected: (positions: number[]) => void;
  onRerollSelected: (positions: number[]) => void;
};

export function ExportTab({
  preview,
  previewLoading,
  hasSources,
  previewError,
  markup,
  onExport,
  onShare,
  exportProgress,
  resize,
  framestripHidden,
  comparisons,
  thumbs,
  selectedIndex,
  onSelect,
  onAdd,
  onDelete,
  onDeleteSelected,
  onRerollSelected,
}: Props) {
  const { appSettings } = useAppSettings();
  const { defaultZoom, pixelPerfect } = appSettings;
  const includeMarkup = appSettings.fullscreenIncludes.markup;
  const { mode: rawMode, sourceIndex, onCycle, fullscreen } = usePreview();
  const mode: PreviewMode = rawMode === "weave" ? "single" : rawMode;
  const markupAllowed = mode === "single";
  const drawing = markupAllowed && markup.tool !== null;
  const bands = mode === "split" ? Math.max(1, preview?.sources.length ?? 1) : 1;
  const zoom = useZoom(
    preview?.canvasW ?? 0,
    preview?.canvasH ?? 0,
    defaultZoom,
    pixelPerfect,
    fullscreen,
    bands,
  );

  const annotations = markup.markupState.annotations;
  const resolveCopyFrame = async (): Promise<Blob | null> => {
    const shown = preview?.sources[sourceIndex] ?? preview?.sources[0];
    if (!preview || !shown) return null;
    try {
      const canvas = await frameToCanvas(shown);
      if (annotations.length > 0) {
        const overlay = document.createElement("canvas");
        overlay.width = preview.canvasW;
        overlay.height = preview.canvasH;
        renderMarkup(overlay.getContext("2d")!, annotations, preview.canvasW, preview.canvasH);
        canvas.getContext("2d")!.drawImage(overlay, 0, 0);
      }
      return await canvasToBlob(canvas);
    } catch {
      return null;
    }
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col bg-panel">
        <div
          className={cn(
            "flex h-10 shrink-0 items-stretch border-b border-border bg-[#0e0e12]",
            fullscreen && !includeMarkup && "hidden",
          )}
        >
          <MarkupToolbar
            className="min-w-0 flex-1"
            tool={markup.tool}
            setTool={markup.setTool}
            color={markup.color}
            setColor={markup.setColor}
            size={markup.size}
            setSize={markup.setSize}
            onUndo={markup.onUndo}
            onRedo={markup.onRedo}
            onClear={markup.onClear}
            canUndo={markup.markupState.past.length > 0}
            canRedo={markup.markupState.future.length > 0}
            hasMarkup={annotations.length > 0}
            disabled={!preview || !markupAllowed}
          />
          <button
            type="button"
            onClick={onExport}
            disabled={exportProgress !== null}
            title="Export the comparison images"
            className="flex shrink-0 items-center gap-1.5 border-l border-border bg-primary px-6 text-xs font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary/90 disabled:cursor-default disabled:bg-muted disabled:text-muted-foreground disabled:hover:bg-muted"
          >
            {exportProgress !== null ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Export...{" "}
                {String(
                  exportProgress.total > 0
                    ? Math.round((exportProgress.done / exportProgress.total) * 100)
                    : 0,
                ).padStart(2, "0")}
                %
              </>
            ) : (
              <>
                <ImageDown className="size-3.5" />
                Export
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onShare}
            title="Share the comparison to comp.pics"
            className="flex shrink-0 items-center gap-1.5 border-l border-border bg-panel px-6 text-xs font-semibold text-foreground/90 outline-none transition-colors hover:bg-accent"
          >
            <Share2 className="size-3.5" />
            Share
          </button>
        </div>

        <PreviewStage
          comparison={preview}
          activeSource={sourceIndex}
          mode={mode}
          zoom={zoom}
          loading={previewLoading}
          interactive={!drawing}
          onCycle={onCycle}
          resolveCopyFrame={resolveCopyFrame}
          overlay={
            preview && markupAllowed ? (
              <MarkupCanvas
                annotations={annotations}
                tool={markup.tool}
                color={markup.color}
                size={markup.size}
                width={preview.canvasW}
                height={preview.canvasH}
                onAdd={markup.onAddAnnotation}
              />
            ) : undefined
          }
        >
          {!hasSources && !previewError ? (
            <Empty
              icon={<ImageOff className="size-8" />}
              title="No sources"
              hint="Drag-drop video/image files anywhere to add sources and compare them here."
            />
          ) : previewError ? (
            (() => {
              const { source, detail } = splitSourceError(previewError);
              return (
                <Empty
                  icon={<ImageOff className="size-8 text-destructive" />}
                  title={source ? `Could not render ${source}` : "Could not render"}
                  hint={<ErrorBox message={detail} />}
                />
              );
            })()
          ) : null}
        </PreviewStage>
      </div>
      <div
        className={cn(
          "relative shrink-0 border-t border-border",
          framestripHidden && "hidden",
        )}
        style={{ height: resize.collapsed ? resize.headerHeight : resize.height }}
      >
        {!resize.collapsed && (
          <div
            onPointerDown={resize.onResizeDown}
            onPointerMove={resize.onResizeMove}
            onPointerUp={resize.onResizeUp}
            onPointerCancel={resize.onResizeUp}
            title="Drag to resize"
            className="group absolute inset-x-0 -top-1 z-10 flex h-2 cursor-ns-resize touch-none items-center justify-center"
          >
            <div className="h-0.5 w-full bg-transparent transition-colors group-hover:bg-primary/60" />
          </div>
        )}
        <ComparisonsPane
          comparisons={comparisons}
          thumbs={thumbs}
          selectedIndex={selectedIndex}
          onSelect={onSelect}
          onAdd={onAdd}
          onDelete={onDelete}
          onDeleteSelected={onDeleteSelected}
          onRerollSelected={onRerollSelected}
          aspect={preview ? preview.canvasW / preview.canvasH : 16 / 9}
          collapsed={resize.collapsed}
          onToggleCollapse={() => resize.setCollapsed((c) => !c)}
        />
      </div>
    </div>
  );
}

function Empty({ icon, title, hint }: { icon: ReactNode; title: string; hint: ReactNode }) {
  return (
    <div className="absolute inset-0 flex select-text flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="text-muted-foreground/50">{icon}</div>
      <div className="text-sm font-medium text-foreground/80">{title}</div>
      {typeof hint === "string" ? (
        <div className="max-w-xs text-xs leading-relaxed text-muted-foreground/60">{hint}</div>
      ) : (
        hint
      )}
    </div>
  );
}
