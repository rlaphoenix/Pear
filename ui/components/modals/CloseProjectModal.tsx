import { type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { ConfirmModal } from "@/components/primitives/confirm-modal";

type Props = {
  setConfirmClose: Dispatch<SetStateAction<boolean>>;
  afterSaveRef: MutableRefObject<null | "close" | "quit">;
  onSaveProject: () => void;
  onCloseProject: () => void;
};

export function CloseProjectModal({
  setConfirmClose,
  afterSaveRef,
  onSaveProject,
  onCloseProject,
}: Props) {
  return (
    <ConfirmModal
      heading="Save before closing?"
      message="This project has unsaved changes. Save them now, or discard and close?"
      confirmLabel="Save now"
      confirmVariant="default"
      onConfirm={() => {
        setConfirmClose(false);
        afterSaveRef.current = "close";
        void onSaveProject();
      }}
      discardLabel="Discard"
      onDiscard={() => {
        setConfirmClose(false);
        onCloseProject();
      }}
      onCancel={() => setConfirmClose(false)}
    />
  );
}
