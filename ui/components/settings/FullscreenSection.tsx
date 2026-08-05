import { CheckboxField } from "@/components/primitives/checkbox";
import type { SectionProps } from "@/components/modals/SettingsModal";
import { INCLUDES } from "@/hooks/useFullscreen";
import { Segmented } from "./Segmented";

export function FullscreenSection({ draft, setDraft }: SectionProps) {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-foreground/90">Mode</span>
          <span className="text-xs text-muted-foreground">
            Windowed fills the app's own window with the image. Maximized also maximizes the
            app window (restored on exit). Exclusive puts the window into true,
            monitor-filling fullscreen.
          </span>
        </div>
        <Segmented
          value={draft.fullscreenMode}
          options={[
            ["windowed", "Windowed"],
            ["maximized", "Maximized"],
            ["fullscreen", "Exclusive"],
          ]}
          onChange={(v) => setDraft((d) => ({ ...d, fullscreenMode: v }))}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-foreground/90">Include in fullscreen</span>
          <span className="text-xs text-muted-foreground">
            Choose which parts of the interface stay visible while fullscreen.
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {INCLUDES.map(([key, label]) => (
            <CheckboxField
              key={key}
              checked={draft.fullscreenIncludes[key]}
              onCheckedChange={(v) =>
                setDraft((d) => ({
                  ...d,
                  fullscreenIncludes: { ...d.fullscreenIncludes, [key]: v },
                }))
              }
              label={label}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
