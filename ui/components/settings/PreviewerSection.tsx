import { NumberInput } from "@/components/primitives/number-input";
import type { PreviewBg, PreviewBorder } from "@/lib/tauri";
import { ColorField } from "./ColorField";
import { RangeField } from "./RangeField";
import { Segmented } from "./Segmented";
import type { SectionProps } from "@/components/modals/SettingsModal";

export function PreviewerSection({ draft, setDraft }: SectionProps) {
  const setBg = (patch: Partial<PreviewBg>) =>
    setDraft((d) => ({ ...d, previewBg: { ...d.previewBg, ...patch } }));
  const setBorder = (patch: Partial<PreviewBorder>) =>
    setDraft((d) => ({ ...d, previewBorder: { ...d.previewBorder, ...patch } }));

  const bg = draft.previewBg;
  const border = draft.previewBorder;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-foreground/90">Weave interval</span>
          <span className="text-xs text-muted-foreground">
            In Weave mode, how many consecutive frames each source is shown before the
            preview advances to the next source. 1 alternates every frame (A, B, A, B…); 3
            shows three frames of A, then three of B, and so on. Cycles through all sources.
          </span>
        </div>
        <NumberInput
          className="w-28"
          value={draft.weaveFrames}
          min={1}
          max={1000}
          step={1}
          onValueChange={(v) =>
            setDraft((d) => ({ ...d, weaveFrames: Math.max(1, Math.floor(v || 1)) }))
          }
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-foreground/90">Background</span>
          <span className="text-xs text-muted-foreground">
            The backdrop drawn behind the preview image.
          </span>
        </div>
        <Segmented
          value={bg.mode}
          options={[
            ["checkerboard", "Checkerboard"],
            ["static", "Static"],
            ["gradient", "Gradient"],
          ]}
          onChange={(v) => setBg({ mode: v })}
        />
      {bg.mode === "checkerboard" && (
        <div className="flex flex-col gap-2 border-l border-border pl-3">
          <ColorField
            label="Colour 1"
            value={bg.checkerColor1}
            onChange={(v) => setBg({ checkerColor1: v })}
          />
          <ColorField
            label="Colour 2"
            value={bg.checkerColor2}
            onChange={(v) => setBg({ checkerColor2: v })}
          />
          <RangeField
            label="Opacity"
            value={Math.round(bg.checkerOpacity * 100)}
            min={0}
            max={100}
            step={1}
            suffix="%"
            onChange={(v) => setBg({ checkerOpacity: v / 100 })}
          />
          <RangeField
            label="Size"
            value={bg.checkerSize ?? 11}
            min={2}
            max={48}
            step={1}
            suffix="px"
            onChange={(v) => setBg({ checkerSize: v })}
          />
        </div>
      )}
      {bg.mode === "static" && (
        <div className="flex flex-col gap-2 border-l border-border pl-3">
          <ColorField
            label="Colour"
            value={bg.staticColor}
            onChange={(v) => setBg({ staticColor: v })}
          />
        </div>
      )}
      {bg.mode === "gradient" && (
        <div className="flex flex-col gap-2 border-l border-border pl-3">
          <ColorField
            label="Colour 1"
            value={bg.gradientColor1}
            onChange={(v) => setBg({ gradientColor1: v })}
          />
          <ColorField
            label="Colour 2"
            value={bg.gradientColor2}
            onChange={(v) => setBg({ gradientColor2: v })}
          />
          <div className="flex w-fit items-center gap-3 text-xs text-foreground/85">
            <span className="w-24 shrink-0">Angle</span>
            <NumberInput
              className="w-28"
              value={bg.gradientAngle}
              min={0}
              max={360}
              step={15}
              postfix="°"
              onValueChange={(v) => setBg({ gradientAngle: v })}
            />
          </div>
        </div>
      )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-foreground/90">Border</span>
          <span className="text-xs text-muted-foreground">
            Useful when the content blends into the background. To disable it, set the
            Thickness to 0.
          </span>
        </div>
        <RangeField
          label="Thickness"
          value={border.width}
          min={0}
          max={16}
          step={1}
          suffix="px"
          onChange={(v) => setBorder({ width: v })}
        />
        <RangeField
          label="Rounding"
          value={border.radius}
          min={0}
          max={32}
          step={1}
          suffix="px"
          onChange={(v) => setBorder({ radius: v })}
        />
        <ColorField
          label="Colour"
          value={border.color}
          onChange={(v) => setBorder({ color: v })}
        />
      </div>
    </section>
  );
}
