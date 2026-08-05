import { NumberInput } from "@/components/primitives/number-input";
import { FRAME_MATCHES, type FrameMatch } from "@/lib/tauri";
import { RangeField } from "./RangeField";
import { Segmented } from "./Segmented";
import type { SectionProps } from "@/components/modals/SettingsModal";

const matchOptions = FRAME_MATCHES.map((m) => [m, m] as const);

export function ExportSection({ draft, setDraft }: SectionProps) {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-foreground/90">Default Amount</span>
          <span className="text-xs text-muted-foreground">
            Up to how many comparisons a brand-new project starts with. Fewer are created only
            when the minimum distance can't fit this many. You can add, remove or re-roll
            individual comparisons per project from the strip afterwards.
          </span>
        </div>
        <NumberInput
          className="w-28"
          value={draft.defaultCount}
          min={1}
          max={500}
          step={1}
          onValueChange={(v) => setDraft((d) => ({ ...d, defaultCount: v }))}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-foreground/90">Minimum distance</span>
          <span className="text-xs text-muted-foreground">
            Keeps randomly-picked comparison frames from clustering: no two can be closer than
            this percent of the selectable span.
          </span>
        </div>
        <RangeField
          value={draft.minDistance}
          min={0}
          max={50}
          step={1}
          suffix="%"
          onChange={(v) => setDraft((d) => ({ ...d, minDistance: v }))}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-foreground/90">Order</span>
          <span className="text-xs text-muted-foreground">
            Ordered keeps the comparisons sorted by frame number at all times, so they stay in
            chronological order even as you add, delete or re-roll them. Unordered keeps them in
            the order they were picked.
          </span>
        </div>
        <Segmented<"unordered" | "ordered">
          value={draft.orderedComparisons ? "ordered" : "unordered"}
          options={[
            ["unordered", "Unordered"],
            ["ordered", "Ordered"],
          ]}
          onChange={(v) => setDraft((d) => ({ ...d, orderedComparisons: v === "ordered" }))}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-foreground/90">Margins</span>
          <span className="text-xs text-muted-foreground">
            Trim the start and end of the selectable range so comparisons aren't picked from a
            clip's very beginning or end (intros, credits, black frames).
          </span>
        </div>
        <div className="flex w-fit items-center gap-3 text-xs text-foreground/85">
          <span className="w-24 shrink-0">Start</span>
          <NumberInput
            className="w-28"
            value={Math.round(draft.marginStart * 100)}
            min={0}
            max={45}
            step={1}
            postfix="%"
            onValueChange={(v) => setDraft((d) => ({ ...d, marginStart: Math.min(0.9, v / 100) }))}
          />
        </div>
        <div className="flex w-fit items-center gap-3 text-xs text-foreground/85">
          <span className="w-24 shrink-0">End</span>
          <NumberInput
            className="w-28"
            value={Math.round(draft.marginEnd * 100)}
            min={0}
            max={45}
            step={1}
            postfix="%"
            onValueChange={(v) => setDraft((d) => ({ ...d, marginEnd: Math.min(0.9, v / 100) }))}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-foreground/90">Frame type match</span>
          <span className="text-xs text-muted-foreground">
            Restrict which frame types (I / P / B) a comparison can land on; every source must
            match. Any allows all types.
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-foreground/85">
          <Segmented<FrameMatch>
            value={draft.match}
            options={matchOptions}
            onChange={(v) => setDraft((d) => ({ ...d, match: v }))}
          />
        </div>
      </div>
    </section>
  );
}
