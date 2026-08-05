import { useEffect, useState } from "react";
import { type UpdateState } from "@/components/UpdateChecker";
import { checkForUpdate, isUpdateIgnored, type UpdateInfo } from "@/lib/update";

export function useUpdateCheck() {
  const [updateState, setUpdateState] = useState<UpdateState>("hidden");
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    setUpdateState("checking");
    void (async () => {
      try {
        const info = await checkForUpdate();
        if (!info) {
          setUpdateState("hidden");
          return;
        }
        setUpdate(info);
        if (isUpdateIgnored(info.version)) {
          setUpdateState("hidden");
        } else {
          setUpdateState("available");
          setUpdateModalOpen(true);
        }
      } catch {
        setUpdateState("hidden");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    updateState,
    setUpdateState,
    update,
    updateModalOpen,
    setUpdateModalOpen,
    updating,
    setUpdating,
  };
}
