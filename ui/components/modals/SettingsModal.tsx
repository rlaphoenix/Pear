import { useState, type Dispatch, type SetStateAction } from "react";
import { Modal } from "@/components/primitives/modal";
import { Button } from "@/components/primitives/button";
import type { AppSettings } from "@/lib/tauri";
import { DecodingSection } from "@/components/settings/DecodingSection";
import { ExportSection } from "@/components/settings/ExportSection";
import { ScalingSection } from "@/components/settings/ScalingSection";
import { PreviewerSection } from "@/components/settings/PreviewerSection";
import { FullscreenSection } from "@/components/settings/FullscreenSection";
import { INCLUDES } from "@/hooks/useFullscreen";
import { InfoBoxSection } from "@/components/settings/InfoBoxSection";
import { GeneralSection } from "@/components/settings/GeneralSection";

interface Props {
  settings: AppSettings;
  onSave: (next: AppSettings) => void;
  onClose: () => void;
}

export interface SectionProps {
  draft: AppSettings;
  setDraft: Dispatch<SetStateAction<AppSettings>>;
}

const SECTIONS = [
  { id: "general", label: "General" },
  { id: "decoding", label: "Decoding" },
  { id: "export", label: "Export" },
  { id: "scaling", label: "Scaling" },
  { id: "background", label: "Previewer" },
  { id: "fullscreen", label: "Fullscreen" },
  { id: "infobox", label: "Info Box" },
] as const;

export function SettingsModal({ settings, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const dirty =
    draft.defaultCount !== settings.defaultCount ||
    draft.minDistance !== settings.minDistance ||
    draft.marginStart !== settings.marginStart ||
    draft.marginEnd !== settings.marginEnd ||
    draft.match !== settings.match ||
    draft.orderedComparisons !== settings.orderedComparisons ||
    draft.defaultZoom !== settings.defaultZoom ||
    draft.pixelPerfect !== settings.pixelPerfect ||
    draft.zoomAlgo !== settings.zoomAlgo ||
    draft.fullscreenMode !== settings.fullscreenMode ||
    draft.infoBoxPosition !== settings.infoBoxPosition ||
    draft.infoBoxScale !== settings.infoBoxScale ||
    draft.weaveFrames !== settings.weaveFrames ||
    draft.watermark !== settings.watermark ||
    draft.hwdevice !== settings.hwdevice ||
    draft.hwfallback !== settings.hwfallback ||
    draft.checkForUpdates !== settings.checkForUpdates ||
    INCLUDES.some(([k]) => draft.fullscreenIncludes[k] !== settings.fullscreenIncludes[k]) ||
    JSON.stringify(draft.previewBg) !== JSON.stringify(settings.previewBg) ||
    JSON.stringify(draft.previewBorder) !== JSON.stringify(settings.previewBorder);

  const [active, setActive] = useState<string>(SECTIONS[0].id);

  return (
    <Modal
      title="Settings"
      onClose={onClose}
      className="h-[85vh] max-w-[1344px]"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!dirty}
            onClick={() => {
              onSave(draft);
              onClose();
            }}
          >
            Save Settings
          </Button>
        </>
      }
    >
      <div className="-m-4 flex h-full">
        <nav className="w-44 shrink-0 overflow-y-auto border-r border-border py-2">
          <ul className="flex flex-col gap-1">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setActive(s.id)}
                  className={
                    "w-full cursor-pointer border-l-2 px-4 py-2 text-left text-sm transition-colors " +
                    (active === s.id
                      ? "border-primary bg-accent/60 text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground")
                  }
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto p-4">
        {active === "decoding" && <DecodingSection draft={draft} setDraft={setDraft} />}
        {active === "export" && <ExportSection draft={draft} setDraft={setDraft} />}
        {active === "scaling" && <ScalingSection draft={draft} setDraft={setDraft} />}
        {active === "background" && <PreviewerSection draft={draft} setDraft={setDraft} />}
        {active === "fullscreen" && <FullscreenSection draft={draft} setDraft={setDraft} />}
        {active === "infobox" && <InfoBoxSection draft={draft} setDraft={setDraft} />}
        {active === "general" && <GeneralSection draft={draft} setDraft={setDraft} />}
        </div>
      </div>
    </Modal>
  );
}
