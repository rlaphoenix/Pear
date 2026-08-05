import { useCallback, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "@/lib/toast";
import { PROJECT_EXT } from "@/state/AppState";
import {
  fileExists,
  fileId,
  saveProject as writeProjectFile,
  type Config,
  type FileId,
} from "@/lib/tauri";

export type Slot = {
  idx: number;
  letter: string;
  origPath: string;
  path: string;
  storedId?: FileId;
  currentId?: FileId;
  exists: boolean;
};
export type OpenModal =
  | { kind: "missing"; path: string; cfg: Config; slots: Slot[] }
  | { kind: "mismatch"; path: string; cfg: Config; slots: Slot[] };

type Options = {
  readProject: (path: string) => Promise<Config>;
  applyProject: (cfg: Config, path: string) => Promise<void>;
};

export function useProjectOpen({ readProject, applyProject }: Options) {
  const [openModal, setOpenModal] = useState<OpenModal | null>(null);

  const finalizeOpen = useCallback(
    async (path: string, cfg: Config, slots: Slot[], updateIds: boolean) => {
      const changed = slots.some((s) => s.path !== s.origPath);
      const oldSources = cfg.sources ?? {};
      // Rebuild `sources` in slot order, applying any path remaps - so the
      // key order (which is the source order) is preserved even when a path
      // changes (reassigning a key would otherwise move it to the end).
      const sources: Config["sources"] = {};
      for (const s of slots) {
        const data = oldSources[s.origPath];
        if (data) sources[s.path] = { ...data };
      }
      if (updateIds) {
        for (const s of slots) {
          if (s.currentId && sources[s.path]) {
            sources[s.path] = {
              ...sources[s.path],
              size: s.currentId.size,
              id: s.currentId.id,
            };
          }
        }
      }
      const final: Config = { ...cfg, sources };
      if (changed || updateIds) {
        try {
          await writeProjectFile(path, final);
        } catch (e) {
          console.error(`Failed to update project "${path}":`, e);
          toast({ kind: "error", msg: "Couldn't update the project file." });
        }
      }
      await applyProject(final, path);
      setOpenModal(null);
    },
    [applyProject],
  );

  const checkIds = useCallback(
    async (path: string, cfg: Config, slots: Slot[], silent = false) => {
      const withIds: Slot[] = await Promise.all(
        slots.map(async (s) => ({
          ...s,
          currentId: await fileId(s.path).catch(() => undefined),
        })),
      );
      const mismatch = withIds.some(
        (s) => s.storedId && s.currentId && s.storedId.id !== s.currentId.id,
      );
      if (mismatch) {
        if (silent)
          toast({ kind: "error", msg: "Couldn't reopen the last project - a source file has changed." });
        else setOpenModal({ kind: "mismatch", path, cfg, slots: withIds });
      } else {
        await finalizeOpen(path, cfg, withIds, false);
      }
    },
    [finalizeOpen],
  );

  const beginOpen = useCallback(
    async (path: string, silent = false) => {
      let cfg: Config;
      try {
        cfg = await readProject(path);
      } catch (e) {
        console.error(`Failed to open project "${path}":`, e);
        toast({
          kind: "error",
          msg: silent
            ? "Couldn't reopen the last project - the file is unavailable."
            : "Couldn't open project - the file is missing or not a valid project.",
        });
        return;
      }
      const paths = Object.keys(cfg.sources ?? {});
      if (paths.length === 0) {
        console.error(`Project "${path}" has no sources.`);
        toast({
          kind: "error",
          msg: silent
            ? "Couldn't reopen the last project - it has no sources."
            : "Couldn't open project - it has no sources.",
        });
        return;
      }
      const slots: Slot[] = await Promise.all(
        paths.map(async (p, idx) => {
          const ss = cfg.sources?.[p];
          return {
            idx,
            letter: String.fromCharCode(65 + idx),
            origPath: p,
            path: p,
            storedId: ss?.id ? { size: ss.size, id: ss.id } : undefined,
            exists: await fileExists(p),
          };
        }),
      );
      if (slots.some((s) => !s.exists)) {
        if (silent)
          toast({ kind: "error", msg: "Couldn't reopen the last project - a source file is missing." });
        else setOpenModal({ kind: "missing", path, cfg, slots });
        return;
      }
      await checkIds(path, cfg, slots, silent);
    },
    [readProject, checkIds],
  );

  const onLoadProject = useCallback(async () => {
    const path = await open({
      directory: false,
      multiple: false,
      title: "Load project",
      filters: [{ name: "Pear Compare Project", extensions: [PROJECT_EXT] }],
    });
    if (typeof path === "string") await beginOpen(path);
  }, [beginOpen]);

  const pickReplacement = useCallback(async (idx: number) => {
    const selected = await open({
      directory: false,
      multiple: false,
      title: "Choose replacement file",
    });
    if (typeof selected !== "string") return;
    setOpenModal((m) =>
      m && m.kind === "missing"
        ? {
            ...m,
            slots: m.slots.map((s) =>
              s.idx === idx ? { ...s, path: selected, exists: true } : s,
            ),
          }
        : m,
    );
  }, []);

  return {
    openModal,
    setOpenModal,
    beginOpen,
    onLoadProject,
    checkIds,
    finalizeOpen,
    pickReplacement,
  };
}
