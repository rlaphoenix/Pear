import { useEffect, useState } from "react";
import {
  Crop as CropIcon,
  Maximize2,
  Palette,
  Plus,
  Ratio,
  Tag,
  Timer,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/primitives/modal";
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
  type SourceId,
  type TempoMode,
  type TempoDecimator,
} from "@/lib/tauri";
import { type UiSource } from "@/state/AppState";
import { useProject } from "@/state/AppState";
import { SourceBadge } from "@/components/SourceBadge";
import { FileInputField } from "@/components/tabs/sources/FileInputField";
import { DeinterlacerField } from "@/components/tabs/sources/DeinterlacerField";
import { DynamicRangeField } from "@/components/tabs/sources/DynamicRangeField";
import { SourceEditor } from "@/components/tabs/sources/SourceEditor";

const algoOptions = ALGOS.map((a) => ({ value: a, label: a }));

const nameOf = (s: UiSource) => s.name || s.path?.split(/[\\/]/).pop() || "No source";

interface Props {
  scriptFor: (id: SourceId) => string;
  setScript: (id: SourceId, s: string) => void;
  page: SourceId;
  setPage: (id: SourceId) => void;
}

export function SourcesTab({ scriptFor, setScript, page, setPage }: Props) {
  const { settings, pickSources, removeSource, reorderSources } = useProject();
  const sources = settings.sources;
  const [spatialOpen, setSpatialOpen] = useState(false);
  const sourceIds = sources.map((s) => s.id);
  const deintKernelOptions = DEINT_KERNELS.map((a) => ({
    value: a,
    label: deintKernelLabel(a),
  }));

  useEffect(() => {
    if (sources.some((s) => s.id === page)) return;
    setPage(sources[0]?.id ?? "");
  }, [sources, page]);

  const selected = sources.find((s) => s.id === page);

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border bg-[#080809] px-2 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          <SortableList
            horizontal
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
                      "relative flex shrink-0 items-center rounded-[6px] transition-colors",
                      page === s.id
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-white/5 hover:text-foreground/80",
                      isDragging && "bg-accent shadow-lg",
                    )}
                  >
                    <button
                      type="button"
                      {...attributes}
                      {...listeners}
                      onClick={() => setPage(s.id)}
                      title={nameOf(s)}
                      className="flex min-w-0 cursor-grab items-center gap-2 py-1.5 pl-2.5 pr-2 text-left text-xs outline-none active:cursor-grabbing"
                    >
                      <SourceBadge index={i} />
                      <span className="max-w-[20rem] truncate leading-none">{nameOf(s)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSource(s.id)}
                      title="Remove this source"
                      className="flex size-7 shrink-0 items-center justify-center text-muted-foreground/40 outline-none hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                )}
              </SortableRow>
            ))}
          </SortableList>

          <button
            type="button"
            onClick={pickSources}
            className="flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground"
          >
            <Plus className="size-3.5" />
            Add Source
          </button>
        </div>

        <button
          type="button"
          onClick={() => setSpatialOpen(true)}
          className="flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground"
        >
          <Maximize2 className="size-3.5" />
          Spatial Alignment
        </button>
      </div>

      {selected ? (
        <div className="flex min-h-0 flex-1">
          <div className="w-[32rem] shrink-0 overflow-y-auto p-3">
            <SourcePage
              key={selected.id}
              source={selected}
              deintKernelOptions={deintKernelOptions}
            />
          </div>
          <div className="min-w-0 flex-1">
            <SourceEditor sourceId={selected.id} scriptFor={scriptFor} setScript={setScript} />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center text-xs text-muted-foreground/50">
          No sources. Add one from the tab bar.
        </div>
      )}

      {spatialOpen && (
        <Modal title="Spatial Alignment" onClose={() => setSpatialOpen(false)} className="max-w-2xl">
          <ResolutionPage />
        </Modal>
      )}
    </div>
  );
}

function FrameRateField({ source }: { source: UiSource }) {
  const ctx = useProject();
  const fpsList =
    source.tempoFps && !FPS_PRESETS.includes(source.tempoFps)
      ? [source.tempoFps, ...FPS_PRESETS]
      : FPS_PRESETS;
  const fpsOptions = fpsList.map((f) => ({ value: f, label: `${f} fps` }));

  return (
    <div className="flex flex-col gap-2">
      <SubLabel icon={<Timer className="size-3" />}>Frame rate</SubLabel>
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
    <div className="flex flex-col gap-5">
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

      <FrameRateField source={source} />

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

function ResolutionPage() {
  const { settings, patch } = useProject();
  return (
    <div className="flex flex-col gap-4">
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
