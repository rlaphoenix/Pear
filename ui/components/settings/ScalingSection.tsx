import { CheckboxField } from "@/components/primitives/checkbox";
import { Select } from "@/components/primitives/select";
import { Segmented } from "./Segmented";
import type { SectionProps } from "@/components/modals/SettingsModal";
import { ALGOS, type Algo } from "@/lib/tauri";
import { useProject } from "@/state/AppState";

// Keyed by the VapourSynth core.resize kernel names (the scaler that actually resizes).
const algoDescriptions: Record<Algo, string> = {
  Point: "No blending, copies the nearest pixel. Fast and blocky (best for pixel art).",
  Bilinear: "Smooth 2×2 interpolation. Cheap but softens detail.",
  Bicubic: "Sharp 4×4 interpolation, specifically Catmull-Rom. Good all-round balance (slight edge ringing).",
  Lanczos: "Highest quality, best for downscaling. Slowest (can ring on hard edges).",
  Spline16: "Lighter 4-tap spline. Faster and a little softer than Spline36.",
  Spline36: "Smooth spline with strong detail retention. A solid general-purpose downscaler.",
  Spline64: "8-tap spline. Slightly sharper than Spline36, slower, little visible gain.",
};
const algoOptions = ALGOS.map((a) => ({ value: a, label: a, description: algoDescriptions[a] }));

export function ScalingSection({ draft, setDraft }: SectionProps) {
  const { settings, patch } = useProject();
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-foreground/90">Preview Size</span>
          <span className="text-xs text-muted-foreground">
            How a comparison is first sized. Click the zoom % on the image to flip between
            100% and fit at any time.
          </span>
        </div>
        <Segmented
          value={draft.defaultZoom}
          options={[
            ["fit", "Fit to window"],
            ["actual", "Actual size (100%)"],
          ]}
          onChange={(v) => setDraft((d) => ({ ...d, defaultZoom: v }))}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-foreground/90">Zoom algorithm</span>
          <span className="text-xs text-muted-foreground">
            How the preview is rendered when zoomed on screen (CSS
            image-rendering). Doesn't affect the compared or exported pixels.
          </span>
        </div>
        <Segmented
          value={draft.zoomAlgo}
          options={[
            ["auto", "auto"],
            ["smooth", "smooth"],
            ["crisp-edges", "crisp-edges"],
            ["pixelated", "pixelated"],
          ]}
          onChange={(v) => setDraft((d) => ({ ...d, zoomAlgo: v }))}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-foreground/90">Scaling algorithm</span>
          <span className="text-xs text-muted-foreground">
            Resampling kernel used when a source is upscaled or downscaled to align with the others
            (set which in the preview's Scale dropdown). Applies to the compared and exported pixels.
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-foreground/85">Upscaling</span>
          <Select<Algo>
            value={settings.upscaleAlgo}
            onValueChange={(v) => patch({ upscaleAlgo: v })}
            options={algoOptions}
          />
          <span className="text-xs text-foreground/85">Downscaling</span>
          <Select<Algo>
            value={settings.downscaleAlgo}
            onValueChange={(v) => patch({ downscaleAlgo: v })}
            options={algoOptions}
          />
        </div>
      </div>

      <CheckboxField
        checked={draft.pixelPerfect}
        onCheckedChange={(v) => setDraft((d) => ({ ...d, pixelPerfect: v }))}
        label="Integer scaling"
        description="Restrict zoom to whole-integer scale factors (100%, 200%, 300%, and 1/2, 1/3, …), so every source pixel maps to a whole block of screen pixels."
      />
    </section>
  );
}
