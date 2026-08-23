import { useRef, useState, type ReactNode } from "react";
import { Check, Copy, GripVertical, ImagePlus, Loader2, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SourceBadge } from "@/components/SourceBadge";
import { FrameCanvas } from "@/components/FrameCanvas";
import { previewBgStyle, previewBorderStyle, zoomCss, type PreviewMode } from "@/lib/preview";
import { Select } from "@/components/primitives/select";
import type { Zoom } from "@/hooks/useZoom";
import type { Comparison } from "@/lib/tauri";
import { useAppSettings } from "@/state/AppState";
import { usePreview } from "@/state/PreviewContext";

interface Props {
  comparison: Comparison | null;
  activeSource: number;
  mode: PreviewMode;
  zoom: Zoom;
  loading: boolean;
  interactive?: boolean;
  onCycle?: () => void;
  onLayerPainted?: (index: number, src: string) => void;
  resolveCopyFrame: () => Promise<Blob | null>;
  onAddComparison?: () => void;
  overlay?: ReactNode;
  children?: ReactNode;
}

async function copyImageBlob(blob: Blob): Promise<boolean> {
  try {
    const type = blob.type || "image/png";
    await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
    return true;
  } catch {
    return false;
  }
}

const clampUnit = (v: number) => Math.max(0, Math.min(1, v));

const onDividerDown = (e: React.PointerEvent) => {
  e.stopPropagation();
  e.currentTarget.setPointerCapture(e.pointerId);
};

export function PreviewStage({
  comparison,
  activeSource,
  mode,
  zoom,
  loading,
  interactive = true,
  onCycle,
  onLayerPainted,
  resolveCopyFrame,
  onAddComparison,
  overlay,
  children,
}: Props) {
  const { appSettings } = useAppSettings();
  const { zoomAlgo, previewBg, previewBorder } = appSettings;
  const { juxLeft, juxRight, setJuxLeft, setJuxRight, fullscreen, setFullscreen } = usePreview();
  const canInteract = comparison != null && interactive;
  const sources = comparison?.sources ?? [];

  const boxRef = useRef<HTMLDivElement | null>(null);
  const [jx, setJx] = useState(0.5);
  const rendering = zoomCss(zoomAlgo);

  const [added, setAdded] = useState(false);
  const onAddClick = () => {
    if (!comparison || !onAddComparison) return;
    onAddComparison();
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };

  const dividerX = comparison ? Math.round(zoom.x + jx * comparison.canvasW * zoom.scale) : 0;

  const [copied, setCopied] = useState(false);
  const onCopyFrame = async () => {
    if (!comparison) return;
    const blob = await resolveCopyFrame().catch(() => null);
    if (blob && (await copyImageBlob(blob))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };

  const onDividerMove = (e: React.PointerEvent) => {
    if (e.buttons === 0) return;
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setJx(clampUnit((e.clientX - rect.left) / rect.width));
  };

  const imgClass = "pointer-events-none absolute inset-0 h-full w-full";
  const layers =
    mode === "juxtapose" ? (
      <>
        {sources[juxLeft] && (
          <FrameCanvas
            key="jux-left"
            frame={sources[juxLeft]}
            className={imgClass}
            style={{ imageRendering: rendering, clipPath: `inset(0 ${((1 - jx) * 100).toFixed(4)}% 0 0)` }}
          />
        )}
        {sources[juxRight] && (
          <FrameCanvas
            key="jux-right"
            frame={sources[juxRight]}
            className={imgClass}
            style={{ imageRendering: rendering, clipPath: `inset(0 0 0 ${(jx * 100).toFixed(4)}%)` }}
          />
        )}
      </>
    ) : (
      sources.map((s, i) => (
        <FrameCanvas
          key={s.meta.path}
          frame={s}
          className={imgClass}
          style={{ imageRendering: rendering, opacity: i === activeSource ? 1 : 0 }}
          onPainted={onLayerPainted ? (src) => onLayerPainted(i, src) : undefined}
        />
      ))
    );

  const juxOptions = sources.map((s, i) => ({ value: String(i), label: s.meta.filename }));

  return (
    <div
      ref={zoom.setViewportRef}
      style={comparison ? previewBgStyle(previewBg) : undefined}
      className={cn(
        "relative min-h-0 flex-1 overflow-hidden",
        canInteract &&
          (zoom.zoomed
            ? "cursor-grab active:cursor-grabbing"
            : mode === "single"
              ? "cursor-pointer"
              : ""),
      )}
      onPointerDown={canInteract ? zoom.onPointerDown : undefined}
      onPointerMove={canInteract ? zoom.onPointerMove : undefined}
      onPointerUp={
        canInteract
          ? (e) => {
              zoom.onPointerUp(e);
              if (mode === "single" && !zoom.consumeDrag()) onCycle?.();
            }
          : undefined
      }
    >
      {!comparison ? (
        children
      ) : mode === "split" ? (
        sources.map((s, i) => (
          <div
            key={s.meta.path}
            className="absolute bottom-0 top-0 overflow-hidden"
            style={{
              left: `${(i / sources.length) * 100}%`,
              width: `${(1 / sources.length) * 100}%`,
            }}
          >
            <div
              className="absolute left-0 top-0"
              style={{
                width: comparison.canvasW,
                height: comparison.canvasH,
                transform: zoom.transform,
                transition: zoom.transition,
                transformOrigin: "0 0",
                ...previewBorderStyle(previewBorder, zoom.percent / 100),
              }}
            >
              <FrameCanvas
                frame={s}
                className={imgClass}
                style={{ imageRendering: rendering }}
              />
            </div>
            <SourceBadge
              index={i}
              className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 bg-black/60 text-[13px] text-white/90"
            />
          </div>
        ))
      ) : (
        <div
          ref={boxRef}
          className="absolute left-0 top-0 overflow-hidden"
          style={{
            width: comparison.canvasW,
            height: comparison.canvasH,
            transform: zoom.transform,
            transition: zoom.transition,
            transformOrigin: "0 0",
            ...previewBorderStyle(previewBorder, zoom.percent / 100),
          }}
        >
          {layers}
          {overlay}
        </div>
      )}

      {comparison && mode === "juxtapose" && (
        <>
          <div
            className="pointer-events-none absolute inset-y-0 z-10 bg-white/90"
            style={{ left: dividerX, width: 2, transform: "translateX(-1px)" }}
          />
          <div
            onPointerDown={onDividerDown}
            onPointerMove={onDividerMove}
            title="Drag to compare"
            className="absolute z-20 flex size-[30px] cursor-ew-resize items-center justify-center rounded-full bg-white text-black shadow-md shadow-black/40"
            style={{
              left: dividerX,
              top: "50%",
              transform: "translate(-50%, -50%)",
            }}
          >
            <GripVertical className="size-[18px]" />
          </div>
          <div
            className="absolute bottom-2 left-2 z-20 w-[42%] max-w-56"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            <Select
              value={String(juxLeft)}
              options={juxOptions}
              onValueChange={(v) => setJuxLeft(Number(v))}
              className="h-7 overflow-hidden bg-black/70 text-[11px]"
            />
          </div>
          <div
            className="absolute bottom-2 right-2 z-20 w-[42%] max-w-56"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            <Select
              value={String(juxRight)}
              options={juxOptions}
              onValueChange={(v) => setJuxRight(Number(v))}
              className="h-7 overflow-hidden bg-black/70 text-[11px]"
            />
          </div>
        </>
      )}

      <div className="absolute right-2 top-2 z-20 flex items-center gap-2">
        {comparison && (
          <button
            type="button"
            onClick={zoom.toggle}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            title="Click: 100% (native) · click again: fit to window"
            className="flex h-7 cursor-pointer items-center bg-black/60 px-2 font-mono text-[11px] tabular-nums text-white/90 outline-none hover:bg-black/80"
          >
            {zoom.percent}%
          </button>
        )}
        {comparison && onAddComparison && (
          <button
            type="button"
            onClick={onAddClick}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            title="Add this frame as a comparison (Export tab)"
            className="flex size-7 cursor-pointer items-center justify-center bg-black/60 text-white/90 outline-none hover:bg-black/80"
          >
            {added ? <Check className="size-4 text-primary" /> : <ImagePlus className="size-4" />}
          </button>
        )}
        {comparison && (
          <button
            type="button"
            onClick={onCopyFrame}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            title="Copy this frame (full resolution, with info box)"
            className="flex size-7 cursor-pointer items-center justify-center bg-black/60 text-white/90 outline-none hover:bg-black/80"
          >
            {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
          </button>
        )}
        <button
          type="button"
          onClick={() => setFullscreen((f) => !f)}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
          className="flex size-7 cursor-pointer items-center justify-center bg-black/60 text-white/90 outline-none hover:bg-black/80"
        >
          {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
      </div>

      {loading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}
