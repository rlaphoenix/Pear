import { type Dispatch, type ReactElement, type SetStateAction } from "react";
import { Modal } from "@/components/primitives/modal";
import { Button } from "@/components/primitives/button";
import { SourceBadge } from "@/components/SourceBadge";
import { type Config } from "@/lib/tauri";
import { type OpenModal, type Slot } from "@/hooks/useProjectOpen";

type Props = {
  modal: Extract<OpenModal, { kind: "mismatch" }>;
  setOpenModal: Dispatch<SetStateAction<OpenModal | null>>;
  finalizeOpen: (path: string, cfg: Config, slots: Slot[], updateIds: boolean) => void;
};

export function SourceMismatchModal({ modal, setOpenModal, finalizeOpen }: Props) {
  return (
    <Modal
      title="Source files may have changed"
      onClose={() => setOpenModal(null)}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={() => setOpenModal(null)}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => finalizeOpen(modal.path, modal.cfg, modal.slots, true)}>
            Dismiss &amp; open
          </Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-muted-foreground">
        One or more sources no longer match the fingerprint saved with this project - they
        may have been re-encoded or replaced. Open anyway (and update the saved ids), or
        cancel.
      </p>
      <div className="flex flex-col gap-3">
        {modal.slots.reduce<ReactElement[]>((acc, s) => {
          if (s.storedId && s.currentId && s.storedId.id !== s.currentId.id)
            acc.push(
              <div
                key={s.idx}
                className="flex flex-col gap-1 border border-destructive/40 bg-[#0d0d10] p-2.5"
              >
                <div className="flex items-center gap-2">
                  <SourceBadge index={s.idx} className="text-xs" />
                  <span className="text-[10px] text-destructive">id mismatch</span>
                </div>
                <span className="truncate font-mono text-[10px] text-foreground/80" title={s.path}>
                  {s.path}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground/60">
                  saved id: {s.storedId?.id}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground/60">
                  current id: {s.currentId?.id}
                </span>
              </div>,
            );
          return acc;
        }, [])}
      </div>
    </Modal>
  );
}
