import { useEffect, useState } from "react";
import {
  Crop as CropIcon,
  GripVertical,
  Maximize2,
  Palette,
  Plus,
  Ratio,
  Tag,
  Timer,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NumberInput } from "@/components/primitives/number-input";
import { Select } from "@/components/primitives/select";
import { SubLabel } from "@/components/tabs/sources/SubLabel";
import { CheckboxField } from "@/components/primitives/checkbox";
import { SortableList, SortableRow } from "@/components/primitives/sortable";
import {
  ALGOS,
  DEINT_KERNELS,
  MATRICES,
  RANGES,
  TEMPO_MODES,
  DECIMATORS,
  FPS_PRESETS,
  deintKernelLabel,
  type Algo,
  type Crop,
  type DeintKernel,
  type Matrix,
  type MatrixSetting,
  type Range,
  type RangeSetting,
  type TempoMode,
  type TempoDecimator,
} from "@/lib/tauri";
import { type UiSource } from "@/state/AppState";
import { useProject } from "@/state/AppState";
import { FileInputField } from "@/components/tabs/sources/FileInputField";
import { DeinterlacerField } from "@/components/tabs/sources/DeinterlacerField";
import { DynamicRangeField } from "@/components/tabs/sources/DynamicRangeField";

const algoOptions = ALGOS.map((a) => ({ value: a, label: a }));

const RESOLUTION_PAGE = "__resolution__";
const TEMPORAL_PAGE = "__temporal__";

const nameOf = (s: UiSource) => s.name || s.path?.split(/[\\/]/).pop() || "No source";

export function SourcesTab() {
  const { settings, pickSources, removeSource, reorderSources } = useProject();
  const sources = settings.sources;
  const [page, setPage] = useState<string>(sources[0]?.id ?? RESOLUTION_PAGE);
  const sourceIds = sources.map((s) => s.id);
  const deintKernelOptions = DEINT_KERNELS.map((a) => ({
    value: a,
    label: deintKernelLabel(a),
  }));

  useEffect(() => {
    if (page === RESOLUTION_PAGE || page === TEMPORAL_PAGE || sources.some((s) => s.id === page))
      return;
    setPage(sources[0]?.id ?? RESOLUTION_PAGE);
  }, [sources, page]);

  const selected = sources.find((s) => s.id === page);

  return (
    <div className="flex h-full bg-panel">
      <nav className="flex w-96 shrink-0 flex-col overflow-y-auto border-r border-border py-2">
        <SortableList
          ids={sourceIds}
          onReorder={(activeId, overId) => {
            const from = sourceIds.indexOf(activeId);
            const to = sourceIds.indexOf(overId);
            if (from >= 0 && to >= 0) reorderSources(from, to);
          }}
        >
          {sources.map((s, i) => (
            <SortableRow key={s.id} id={s.id}>
              {({ setNodeRef, style, attributes, listeners, isDragging }) => (
                <div
                  ref={setNodeRef}
                  style={style}
                  className={cn(
                    "flex items-center gap-3 border-l-2 px-3 transition-colors",
                    page === s.id
                      ? "border-primary bg-accent/60"
                      : "border-transparent hover:bg-accent/30",
                    isDragging && "bg-panel shadow-lg",
                  )}
                >
                  <button
                    type="button"
                    {...attributes}
                    {...listeners}
                    title="Drag to reorder this source"
                    className="flex h-8 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground/40 outline-none hover:text-foreground active:cursor-grabbing"
                  >
                    <GripVertical className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage(s.id)}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-3 py-2 text-left text-sm outline-none",
                      page === s.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className="font-mono text-sm font-semibold leading-none">{String.fromCharCode(65 + i)}</span>
                    <span className="min-w-0 flex-1 truncate leading-none">{nameOf(s)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSource(s.id)}
                    title="Remove this source"
                    className="flex size-9 shrink-0 items-center justify-center text-muted-foreground/40 outline-none hover:text-destructive"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              )}
            </SortableRow>
          ))}
        </SortableList>

        <button
          type="button"
          onClick={pickSources}
          className="flex w-full items-center gap-2 border-l-2 border-transparent px-4 py-2 text-left text-sm text-muted-foreground outline-none transition-colors hover:bg-accent/30 hover:text-foreground"
        >
          <Plus className="size-3.5" />
          Add Source
        </button>

        <button
          type="button"
          onClick={() => setPage(RESOLUTION_PAGE)}
          className={cn(
            "mt-auto flex items-center gap-2 border-l-2 px-4 py-2 text-left text-sm outline-none transition-colors",
            page === RESOLUTION_PAGE
              ? "border-primary bg-accent/60 text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <Maximize2 className="size-3.5" />
          Spatial alignment
        </button>

        <button
          type="button"
          onClick={() => setPage(TEMPORAL_PAGE)}
          className={cn(
            "flex items-center gap-2 border-l-2 px-4 py-2 text-left text-sm outline-none transition-colors",
            page === TEMPORAL_PAGE
              ? "border-primary bg-accent/60 text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <Timer className="size-3.5" />
          Temporal alignment
        </button>
      </nav>

      <div className="min-w-0 flex-1 overflow-y-auto p-5">
        {page === RESOLUTION_PAGE ? (
          <ResolutionPage />
        ) : page === TEMPORAL_PAGE ? (
          <TemporalPage />
        ) : selected ? (
          <SourcePage
            key={selected.id}
            source={selected}
            deintKernelOptions={deintKernelOptions}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground/50">
            No sources. Add one from the sidebar.
          </div>
        )}
      </div>
    </div>
  );
}

function SourcePage({
  source,
  deintKernelOptions,
}: {
  source: UiSource;
  deintKernelOptions: { value: DeintKernel; label: string }[];
}) {
  const ctx = useProject();
  const id = source.id;
  const setCrop = (crop: Crop) => ctx.setCrop(id, crop);
  const setDar = (dar: string) => ctx.setDar(id, dar);
  const setDarAlgo = (algo: Algo) => ctx.setDarAlgo(id, algo);
  const setMatrix = (matrix: Matrix) => ctx.setMatrix(id, matrix);
  const setRange = (range: Range) => ctx.setRange(id, range);
  const setSourceName = (name: string) => ctx.setSourceName(id, name);

  const cropField = (key: keyof Crop, label: string) => (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {label}
      </span>
      <NumberInput
        value={source.crop[key]}
        min={0}
        steppers={false}
        onValueChange={(v) => setCrop({ ...source.crop, [key]: Math.max(0, v) })}
      />
    </div>
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <FileInputField source={source} />

      <div className="flex flex-col gap-2">
        <SubLabel icon={<Tag className="size-3" />}>Name</SubLabel>
        <input
          type="text"
          value={source.name}
          aria-label="Name"
          onChange={(e) => setSourceName(e.target.value)}
          className="h-8 border border-border bg-[#0d0d10] px-2 text-xs text-foreground/90 outline-none focus:border-primary/60"
        />
      </div>

      <div className="flex flex-col gap-2">
        <SubLabel icon={<CropIcon className="size-3" />}>Crop</SubLabel>
        <div className="grid grid-cols-4 gap-2">
          {cropField("top", "Top")}
          {cropField("right", "Right")}
          {cropField("bottom", "Bottom")}
          {cropField("left", "Left")}
        </div>
      </div>

      <DeinterlacerField source={source} deintKernelOptions={deintKernelOptions} />

      <DynamicRangeField source={source} />

      <div className="flex flex-col gap-2">
        <SubLabel icon={<Ratio className="size-3" />}>Aspect ratio</SubLabel>
        <div className="flex items-center gap-2">
          <input
            type="text"
            defaultValue={source.dar}
            aria-label="Aspect ratio"
            placeholder="e.g., 16/9, 4/3, 1.85"
            onChange={(e) => setDar(e.target.value.trim())}
            className="h-8 min-w-0 flex-1 border border-border bg-[#0d0d10] px-2 text-xs text-foreground/90 outline-none placeholder:text-muted-foreground/40 focus:border-primary/60"
          />
          <Select<Algo>
            value={source.darAlgo}
            options={algoOptions}
            onValueChange={(v) => setDarAlgo(v)}
            className="h-8 w-auto shrink-0 text-xs"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SubLabel icon={<Palette className="size-3" />}>Colour matrix</SubLabel>
        <Select<MatrixSetting>
          value={source.matrix}
          options={MATRICES}
          onValueChange={(v) => v && setMatrix(v)}
          className="h-8 text-xs"
        />
      </div>

      <div className="flex flex-col gap-2">
        <SubLabel icon={<Palette className="size-3" />}>Colour levels</SubLabel>
        <Select<RangeSetting>
          value={source.range}
          options={RANGES}
          onValueChange={(v) => v && setRange(v)}
          className="h-8 text-xs"
        />
      </div>
    </div>
  );
}

const fmtFps = (v: number) => Number(v.toFixed(3)).toString();

function TemporalRow({ source, index }: { source: UiSource; index: number }) {
  const ctx = useProject();
  const info = source.info;
  const native = info?.nativeFps ?? 0;
  const fpsList = source.tempoFps && !FPS_PRESETS.includes(source.tempoFps)
    ? [source.tempoFps, ...FPS_PRESETS]
    : FPS_PRESETS;
  const fpsOptions = fpsList.map((f) => ({ value: f, label: `${f} fps` }));

  const changed =
    source.tempoMode !== "none" && info && fmtFps(info.fps) !== fmtFps(native);
  const fpsText =
    native > 0
      ? changed
        ? `${fmtFps(native)} → ${fmtFps(info!.fps)} fps`
        : `${fmtFps(native)} fps`
      : "—";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-sm font-semibold">{String.fromCharCode(65 + index)}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">{nameOf(source)}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{fpsText}</span>
      </div>
      <div className="flex items-center gap-2">
        <Select<TempoMode>
          value={source.tempoMode}
          options={TEMPO_MODES}
          onValueChange={(v) => ctx.setTempoMode(source.id, v)}
          className="h-8 min-w-0 flex-1 text-xs"
        />
        {source.tempoMode === "decimate" && (
          <Select<TempoDecimator>
            value={source.tempoDecimator}
            options={DECIMATORS}
            onValueChange={(v) => ctx.setTempoDecimator(source.id, v)}
            className="h-8 w-40 shrink-0 text-xs"
          />
        )}
        {source.tempoMode !== "none" && (
          <Select<string>
            value={source.tempoFps}
            options={fpsOptions}
            onValueChange={(v) => ctx.setTempoFps(source.id, v)}
            className="h-8 w-32 shrink-0 text-xs"
          />
        )}
      </div>
    </div>
  );
}

function TemporalPage() {
  const { settings } = useProject();
  const loaded = settings.sources
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.path);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Line up sources that run at different frame rates. Remove duplicated frames (telecine)
        down to a lower rate, retime a clip without touching its frames, or duplicate frames up
        to match a higher-rate source - all by choosing a target frame rate instead of guessing
        cycles and offsets. These apply to both the preview and the export.
      </p>
      {loaded.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-xs text-muted-foreground/50">
          No sources. Add one from the sidebar.
        </div>
      ) : (
        loaded.map(({ s, i }) => <TemporalRow key={s.id} source={s} index={i} />)
      )}
    </div>
  );
}

function ResolutionPage() {
  const { settings, patch } = useProject();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        When sources differ in resolution they're placed on one shared canvas before
        the info box and watermark are drawn. These options choose how that's done and
        apply to both the preview and the export - you may or may not need them,
        depending on your sources. With all off, each source is centered on the
        bounding box of the largest dimensions.
      </p>
      <div className="flex flex-col gap-2">
        <CheckboxField
          checked={settings.upscaleSmallest}
          onCheckedChange={(v) =>
            patch(
              v
                ? { upscaleSmallest: true, downscaleLargest: false, cropToSmallest: false, padToLargest: false }
                : { upscaleSmallest: false },
            )
          }
          label="Upscale smallest source"
        />
        <div className="pl-[30px]">
          <Select<Algo>
            value={settings.upscaleAlgo}
            onValueChange={(v) => patch({ upscaleAlgo: v })}
            options={algoOptions}
            disabled={!settings.upscaleSmallest}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <CheckboxField
          checked={settings.downscaleLargest}
          onCheckedChange={(v) =>
            patch(
              v
                ? { downscaleLargest: true, upscaleSmallest: false, cropToSmallest: false, padToLargest: false }
                : { downscaleLargest: false },
            )
          }
          label="Downscale largest source"
        />
        <div className="pl-[30px]">
          <Select<Algo>
            value={settings.downscaleAlgo}
            onValueChange={(v) => patch({ downscaleAlgo: v })}
            options={algoOptions}
            disabled={!settings.downscaleLargest}
          />
        </div>
      </div>
      <CheckboxField
        checked={settings.padToLargest}
        onCheckedChange={(v) =>
          patch(
            v
              ? { padToLargest: true, upscaleSmallest: false, downscaleLargest: false, cropToSmallest: false }
              : { padToLargest: false },
          )
        }
        label="Pad to largest source"
        description="Center the smallest source on black at the largest source's resolution, aligning both without scaling or losing any detail."
      />
      <CheckboxField
        checked={settings.cropToSmallest}
        onCheckedChange={(v) =>
          patch(
            v
              ? { cropToSmallest: true, upscaleSmallest: false, downscaleLargest: false, padToLargest: false }
              : { cropToSmallest: false },
          )
        }
        label="Crop to smallest source"
        description="Center-crop the largest source down to the smallest source's resolution, aligning both without scaling. Trims edge detail off the larger source."
      />
    </div>
  );
}
