import { CheckboxField } from "@/components/primitives/checkbox";
import type { SectionProps } from "@/components/modals/SettingsModal";

export function GeneralSection({ draft, setDraft }: SectionProps) {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-foreground/90">On startup</span>
          <span className="text-xs text-muted-foreground">
            When on, Pear checks for a newer release each time it starts and offers to
            update. Turn this off to disable all update checks entirely.
          </span>
        </div>
        <CheckboxField
          checked={draft.checkForUpdates}
          onCheckedChange={(v) => setDraft((d) => ({ ...d, checkForUpdates: v }))}
          label="Check for updates on startup"
        />
      </div>
    </section>
  );
}
