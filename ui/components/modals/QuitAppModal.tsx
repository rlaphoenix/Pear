import { type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { ConfirmModal } from "@/components/primitives/confirm-modal";

type Props = {
  setConfirmQuit: Dispatch<SetStateAction<boolean>>;
  afterSaveRef: MutableRefObject<null | "close" | "quit">;
  onSaveProject: () => void;
  quitApp: () => void;
};

export function QuitAppModal({ setConfirmQuit, afterSaveRef, onSaveProject, quitApp }: Props) {
  return (
    <ConfirmModal
      heading="Save before quitting?"
      message="This project has unsaved changes. Save them now, or discard and quit Pear?"
      confirmLabel="Save now"
      confirmVariant="default"
      onConfirm={() => {
        setConfirmQuit(false);
        afterSaveRef.current = "quit";
        void onSaveProject();
      }}
      discardLabel="Discard & quit"
      onDiscard={quitApp}
      onCancel={() => setConfirmQuit(false)}
    />
  );
}
