import { CheckboxField } from "@/components/primitives/checkbox";
import { Select } from "@/components/primitives/select";
import { HWDEVICES } from "@/lib/tauri";
import type { HwDevice } from "@/lib/tauri";
import type { SectionProps } from "@/components/modals/SettingsModal";

export function DecodingSection({ draft, setDraft }: SectionProps) {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-foreground/90">Hardware decoding</span>
          <span className="text-xs text-muted-foreground">
            A GPU can decode faster than the CPU. If loading fails, switch back to Software.
          </span>
        </div>
        <Select<HwDevice>
          value={draft.hwdevice}
          options={HWDEVICES}
          onValueChange={(v) => setDraft((d) => ({ ...d, hwdevice: v }))}
        />
      </div>
      <div className="flex flex-col gap-2">
        <CheckboxField
          checked={draft.hwfallback}
          onCheckedChange={(v) => setDraft((d) => ({ ...d, hwfallback: v }))}
          label="Fall back to software decoding"
          description="On by default. You may want this disabled to know for sure that the chosen hardware decoder actually works — with it off, a device that can't decode fails loudly instead of silently reverting to the CPU."
        />
      </div>
    </section>
  );
}
