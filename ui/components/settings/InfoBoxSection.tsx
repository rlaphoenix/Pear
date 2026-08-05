import { CheckboxField } from "@/components/primitives/checkbox";
import { InfoPositionGrid } from "./InfoPositionGrid";
import { RangeField } from "./RangeField";
import type { SectionProps } from "@/components/modals/SettingsModal";

export function InfoBoxSection({ draft, setDraft }: SectionProps) {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-foreground/90">Position</span>
          <span className="text-xs text-muted-foreground">
            Where the source name, frame number and type sit on each image. The text aligns to
            the side you pick.
          </span>
        </div>
        <InfoPositionGrid
          value={draft.infoBoxPosition}
          onChange={(v) => setDraft((d) => ({ ...d, infoBoxPosition: v }))}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-foreground/90">Font Size</span>
          <span className="text-xs text-muted-foreground">
            The info box text size, relative to its default.
          </span>
        </div>
        <RangeField
          value={draft.infoBoxScale}
          min={50}
          max={200}
          step={5}
          suffix="%"
          onChange={(v) => setDraft((d) => ({ ...d, infoBoxScale: v }))}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-foreground/90">Watermark</span>
          <span className="text-xs text-muted-foreground">
            Leaving it on is a lovely way to help people discover Pear and support the project,
            but no hard feelings if you switch it off.
          </span>
        </div>
        <CheckboxField
          checked={draft.watermark}
          onCheckedChange={(v) => setDraft((d) => ({ ...d, watermark: v }))}
          label="Show the watermark on exports"
        />
      </div>
    </section>
  );
}
