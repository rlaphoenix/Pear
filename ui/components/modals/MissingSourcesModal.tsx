import { type Dispatch, type SetStateAction } from "react";
import { Modal } from "@/components/primitives/modal";
import { Button } from "@/components/primitives/button";
import { SourceBadge } from "@/components/SourceBadge";
import { cn } from "@/lib/utils";
import { type Config } from "@/lib/tauri";
import { type OpenModal, type Slot } from "@/hooks/useProjectOpen";

type Props = {
  modal: Extract<OpenModal, { kind: "missing" }>;
  setOpenModal: Dispatch<SetStateAction<OpenModal | null>>;
  checkIds: (path: string, cfg: Config, slots: Slot[], silent?: boolean) => void;
  pickReplacement: (idx: number) => void;
};

export function MissingSourcesModal({ modal, setOpenModal, checkIds, pickReplacement }: Props) {
  return (
    <Modal
      title="Missing source files"
      onClose={() => setOpenModal(null)}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={() => setOpenModal(null)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={modal.slots.some((s) => !s.exists)}
            onClick={() => checkIds(modal.path, modal.cfg, modal.slots)}
          >
            Save
          </Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-muted-foreground">
        Some source files from this project couldn't be found. Provide replacements to
        continue.
      </p>
      <div className="flex flex-col gap-3">
        {modal.slots.map((s) => (
          <div key={s.idx} className="flex flex-col gap-1 border border-border bg-[#0d0d10] p-2.5">
            <div className="flex items-center gap-2">
              <SourceBadge index={s.idx} className="text-xs" />
              <span
                className={cn(
                  "text-[10px]",
                  s.exists ? "text-primary" : "text-destructive",
                )}
              >
                {s.exists ? "resolved" : "missing"}
              </span>
              <button
                type="button"
                onClick={() => pickReplacement(s.idx)}
                className="ml-auto text-[11px] text-primary outline-none hover:underline"
              >
                {s.exists ? "Change" : "Choose file"}
              </button>
            </div>
            <span className="truncate font-mono text-[10px] text-foreground/80" title={s.path}>
              {s.path}
            </span>
            {s.storedId && (
              <span className="font-mono text-[10px] text-muted-foreground/50">
                saved id: {s.storedId.id}
              </span>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
