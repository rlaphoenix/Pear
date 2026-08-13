import { useState } from "react";
import { ArrowUpCircle, Download, Loader2 } from "lucide-react";
import { Modal } from "@/components/primitives/modal";
import { Button } from "@/components/primitives/button";
import { CheckboxField } from "@/components/primitives/checkbox";

export function UpdateModal({
  version,
  currentVersion,
  updating,
  portable,
  onUpdate,
  onDownload,
  onViewNotes,
  onDismiss,
}: {
  version: string;
  currentVersion: string;
  updating: boolean;
  portable: boolean;
  onUpdate: () => void;
  onDownload: () => void;
  onViewNotes: () => void;
  onDismiss: (ignore: boolean) => void;
}) {
  const [ignore, setIgnore] = useState(false);

  return (
    <Modal
      onClose={() => !updating && onDismiss(ignore)}
      className="max-w-xl"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <CheckboxField
            checked={ignore}
            onCheckedChange={setIgnore}
            label="Ignore this update"
            disabled={updating}
          />
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => onDismiss(ignore)} disabled={updating}>
              Dismiss
            </Button>
            {portable ? (
              <Button onClick={onDownload}>
                <Download className="size-4" />
                Download
              </Button>
            ) : (
              <Button onClick={onUpdate} disabled={updating}>
                {updating ? <Loader2 className="size-4 animate-spin" /> : <ArrowUpCircle className="size-4" />}
                {updating ? "Updating…" : "Update now"}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex items-start gap-4 py-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
          <ArrowUpCircle className="size-6" />
        </span>
        <div className="flex min-w-0 flex-col gap-2 pt-1">
          <p className="text-xl font-semibold text-foreground">Update available</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {portable ? (
              <>
                Pear {version} is available. You're on {currentVersion}. Open the release
                page to grab the latest portable build.
              </>
            ) : (
              <>
                Pear {version} is ready to install. You're on {currentVersion}. It will
                download and restart the app for you.
              </>
            )}
          </p>
          <button
            type="button"
            onClick={onViewNotes}
            className="w-fit text-sm font-medium text-emerald-400 underline-offset-2 outline-none hover:underline"
          >
            View the release notes
          </button>
        </div>
      </div>
    </Modal>
  );
}
