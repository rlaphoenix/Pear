import { type Dispatch, type SetStateAction } from "react";
import { SettingsModal } from "@/components/modals/SettingsModal";
import { AboutModal } from "@/components/modals/AboutModal";
import { UpdateModal } from "@/components/modals/UpdateModal";
import { CloseProjectModal } from "@/components/modals/CloseProjectModal";
import { QuitAppModal } from "@/components/modals/QuitAppModal";
import { NameProjectModal } from "@/components/modals/NameProjectModal";
import { MissingSourcesModal } from "@/components/modals/MissingSourcesModal";
import { SourceMismatchModal } from "@/components/modals/SourceMismatchModal";
import { openUrl, type AppSettings } from "@/lib/tauri";
import { toast } from "@/lib/toast";
import { type useUpdateCheck } from "@/hooks/useUpdateCheck";
import { type useProjectLifecycle } from "@/hooks/useProjectLifecycle";
import { type useProjectOpen } from "@/hooks/useProjectOpen";

type Props = {
  settingsOpen: boolean;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  appSettings: AppSettings;
  saveAppSettings: (next: AppSettings) => unknown;
  aboutOpen: boolean;
  setAboutOpen: Dispatch<SetStateAction<boolean>>;
  update: ReturnType<typeof useUpdateCheck>;
  lifecycle: ReturnType<typeof useProjectLifecycle>;
  projectOpen: ReturnType<typeof useProjectOpen>;
};

export function Modals({
  settingsOpen,
  setSettingsOpen,
  appSettings,
  saveAppSettings,
  aboutOpen,
  setAboutOpen,
  update,
  lifecycle,
  projectOpen,
}: Props) {
  const upd = update.update;
  return (
    <>
      {settingsOpen && (
        <SettingsModal
          settings={appSettings}
          onSave={(s) => {
            void saveAppSettings(s);
            toast({ kind: "success", msg: "Settings saved" });
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}

      {update.updateModalOpen && upd && (
        <UpdateModal
          version={upd.version}
          currentVersion={upd.currentVersion}
          updating={update.updating}
          portable={update.portable}
          onDownload={() => void openUrl(upd.downloadUrl).catch(() => {})}
          onUpdate={async () => {
            update.setUpdating(true);
            try {
              await update.install();
            } catch {
              await openUrl(upd.url).catch(() => {});
              toast({ kind: "error", msg: "In-app update failed - opened the release page instead." });
              update.setUpdateModalOpen(false);
            } finally {
              update.setUpdating(false);
            }
          }}
          onViewNotes={() => void openUrl(upd.url).catch(() => {})}
          onDismiss={(shouldIgnore) => {
            if (shouldIgnore) update.ignore();
            else update.setUpdateModalOpen(false);
          }}
        />
      )}

      {lifecycle.confirmClose && (
        <CloseProjectModal
          setConfirmClose={lifecycle.setConfirmClose}
          afterSaveRef={lifecycle.afterSaveRef}
          onSaveProject={lifecycle.onSaveProject}
          onCloseProject={lifecycle.onCloseProject}
        />
      )}

      {lifecycle.confirmQuit && (
        <QuitAppModal
          setConfirmQuit={lifecycle.setConfirmQuit}
          afterSaveRef={lifecycle.afterSaveRef}
          onSaveProject={lifecycle.onSaveProject}
          quitApp={lifecycle.quitApp}
        />
      )}

      {lifecycle.saveName !== null && (
        <NameProjectModal
          saveName={lifecycle.saveName}
          setSaveName={lifecycle.setSaveName}
          afterSaveRef={lifecycle.afterSaveRef}
          confirmSaveName={lifecycle.confirmSaveName}
        />
      )}

      {projectOpen.openModal?.kind === "missing" && (
        <MissingSourcesModal
          modal={projectOpen.openModal}
          setOpenModal={projectOpen.setOpenModal}
          checkIds={projectOpen.checkIds}
          pickReplacement={projectOpen.pickReplacement}
        />
      )}

      {projectOpen.openModal?.kind === "mismatch" && (
        <SourceMismatchModal
          modal={projectOpen.openModal}
          setOpenModal={projectOpen.setOpenModal}
          finalizeOpen={projectOpen.finalizeOpen}
        />
      )}
    </>
  );
}
