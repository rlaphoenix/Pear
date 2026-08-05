import { AlertTriangle } from "lucide-react";
import { Modal } from "@/components/primitives/modal";
import { Button } from "@/components/primitives/button";

export function ConfirmModal({
  heading,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  confirmVariant = "destructive",
  discardLabel,
  onDiscard,
}: {
  heading: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmVariant?: "default" | "destructive";
  discardLabel?: string;
  onDiscard?: () => void;
}) {
  return (
    <Modal
      onClose={onCancel}
      className="max-w-xl"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            {onDiscard && discardLabel && (
              <Button variant="destructive" onClick={onDiscard}>
                {discardLabel}
              </Button>
            )}
            <Button variant={confirmVariant} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex items-start gap-4 py-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
          <AlertTriangle className="size-6" />
        </span>
        <div className="flex flex-col gap-2 pt-1">
          <p className="text-xl font-semibold text-foreground">{heading}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{message}</p>
        </div>
      </div>
    </Modal>
  );
}
