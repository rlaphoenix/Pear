import { forwardRef, type ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { cn, splitSourceError, frameToBlob } from "@/lib/utils";
import { ErrorBox } from "@/components/primitives/error-box";
import { useZoom } from "@/hooks/useZoom";
import { PreviewStage } from "@/components/PreviewStage";
import { Filmstrip } from "@/components/tabs/preview/Filmstrip";
import { Controls } from "@/components/tabs/preview/Controls";
import { type GenParams } from "@/lib/tauri";
import { useAppSettings, useProject } from "@/state/AppState";
import { usePreview } from "@/state/PreviewContext";
import { useTimebase } from "@/state/TimebaseContext";
import { usePreviewEngine, type PreviewTabHandle } from "@/hooks/usePreviewEngine";
import { useSourceKeyframes } from "@/hooks/useSourceKeyframes";
import { usePreviewKeyboard } from "@/hooks/usePreviewKeyboard";

interface Props {
  params: GenParams;
  ready: boolean;
  active: boolean;
  onAddComparison?: () => void;
}

export type { PreviewTabHandle };

export const PreviewTab = forwardRef<PreviewTabHandle, Props>(function PreviewTab(
  { params, ready, active, onAddComparison },
  ref,
) {
  const { settings } = useProject();
  const sources = settings.sources;
  const { appSettings } = useAppSettings();
  const { defaultZoom, pixelPerfect, weaveFrames } = appSettings;
  const includeFramestrip = appSettings.fullscreenIncludes.framestrip;
  const includeSeekbar = appSettings.fullscreenIncludes.seekbar;
  const { mode, sourceIndex, onCycle, setSourceIndex: onSelectSource, fullscreen } = usePreview();
  const { base, setBase, maxBase } = useTimebase();

  const sourceCount = params.sources.length;
  const shownSource = sources[sourceIndex];
  const paramsKey = JSON.stringify(params);

  const keyframes = useSourceKeyframes(shownSource);

  const { preview, loading, error, displayIndex, onLayerPainted, currentFrame, playing, togglePlay } =
    usePreviewEngine(
      { params, paramsKey, ready, active, mode, sourceIndex, base, setBase, maxBase, sources, weaveFrames },
      ref,
    );

  const aspect = preview ? preview.canvasW / preview.canvasH : 16 / 9;
  const bands = mode === "split" ? Math.max(1, preview?.sources.length ?? 1) : 1;
  const zoom = useZoom(
    preview?.canvasW ?? 0,
    preview?.canvasH ?? 0,
    defaultZoom,
    pixelPerfect,
    fullscreen,
    bands,
  );

  const { jumpKeyframe } = usePreviewKeyboard({
    keyframes,
    shownSource,
    base,
    maxBase,
    setBase,
    active,
    togglePlay,
  });

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex min-w-0 flex-1 flex-col bg-panel">
        <PreviewStage
          comparison={error ? null : preview}
          activeSource={displayIndex}
          resolveCopyFrame={async () => (currentFrame ? frameToBlob(currentFrame) : null)}
          onLayerPainted={onLayerPainted}
          mode={mode}
          zoom={zoom}
          loading={loading && !playing}
          onCycle={onCycle}
          onAddComparison={onAddComparison}
        >
          {!ready ? (
            <Empty
              title="No sources"
              hint="Drag-drop video/image files anywhere to add sources and compare them here."
            />
          ) : error ? (
            (() => {
              const { source, detail } = splitSourceError(error);
              return (
                <Empty
                  title={source ? `Could not render ${source}` : "Could not render"}
                  hint={<ErrorBox message={detail} />}
                />
              );
            })()
          ) : null}
        </PreviewStage>

        <Filmstrip
          base={base}
          maxBase={maxBase}
          aspect={aspect}
          sourceCount={sourceCount}
          activeSource={sourceIndex}
          params={params}
          paramsKey={paramsKey}
          ready={ready}
          active={active}
          setBase={setBase}
          onSelectSource={onSelectSource}
          className={cn(fullscreen && !includeFramestrip && "hidden")}
        />
      </div>

      <div className={cn(fullscreen && !includeSeekbar && "hidden")}>
        <Controls
          base={base}
          setBase={setBase}
          maxBase={maxBase}
          onJumpKeyframe={jumpKeyframe}
          canKeyframe={keyframes.length > 0}
          playing={playing}
          onTogglePlay={togglePlay}
          tracks={sources.map((s, i) => ({
            id: s.id,
            letter: String.fromCharCode(65 + i),
            segments: s.segments,
            fps: s.info?.fps ?? 25,
          }))}
        />
      </div>
    </div>
  );
});

function Empty({ title, hint }: { title: string; hint: ReactNode }) {
  return (
    <div className="absolute inset-0 flex select-text flex-col items-center justify-center gap-3 p-8 text-center">
      <ImageOff className="size-8 text-muted-foreground/50" />
      <div className="text-sm font-medium text-foreground/80">{title}</div>
      {typeof hint === "string" ? (
        <div className="max-w-xs text-xs leading-relaxed text-muted-foreground/60">{hint}</div>
      ) : (
        hint
      )}
    </div>
  );
}
