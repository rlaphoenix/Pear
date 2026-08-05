import { type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { Modal } from "@/components/primitives/modal";
import { Button } from "@/components/primitives/button";
import { PROJECT_EXT } from "@/state/AppState";

type Props = {
  saveName: string;
  setSaveName: Dispatch<SetStateAction<string | null>>;
  afterSaveRef: MutableRefObject<null | "close" | "quit">;
  confirmSaveName: () => void;
};

export function NameProjectModal({ saveName, setSaveName, afterSaveRef, confirmSaveName }: Props) {
  const cancel = () => {
    afterSaveRef.current = null;
    setSaveName(null);
  };
  return (
    <Modal
      title="Name your project"
      onClose={cancel}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={cancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={confirmSaveName}>
            Continue…
          </Button>
        </>
      }
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">Project name</span>
        <input
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && confirmSaveName()}
          className="border border-input bg-[#0d0d10] px-2.5 py-1.5 text-sm text-foreground outline-none focus-visible:border-ring"
        />
      </label>
      <p className="mt-2 text-xs text-muted-foreground/70">
        You'll choose where to save the .{PROJECT_EXT} file next.
      </p>
    </Modal>
  );
}
