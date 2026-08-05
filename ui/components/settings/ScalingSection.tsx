import { CheckboxField } from "@/components/primitives/checkbox";
import { Segmented } from "./Segmented";
import type { SectionProps } from "@/components/modals/SettingsModal";

export function ScalingSection({ draft, setDraft }: SectionProps) {
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

      <CheckboxField
        checked={draft.pixelPerfect}
        onCheckedChange={(v) => setDraft((d) => ({ ...d, pixelPerfect: v }))}
        label="Integer scaling"
        description="Restrict zoom to whole-integer scale factors (100%, 200%, 300%, and 1/2, 1/3, …), so every source pixel maps to a whole block of screen pixels."
      />
    </section>
  );
}
