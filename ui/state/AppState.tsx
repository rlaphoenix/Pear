import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import {
  Algo,
  Config,
  Crop,
  DeintKernel,
  DeinterlaceOpt,
  Matrix,
  MatrixSetting,
  Range,
  RangeSetting,
  TonemapSrc,
  TonemapFunc,
  GamutMapping,
  TonemapOpt,
  FrameMatch,
  MatchKind,
  initSource,
  type IndexEvent,
  clearCache,
  discardIndexes,
  loadPrefs,
  saveTemplates,
  saveSettings,
  setHwdevice,
  setHwfallback,
  AppSettings,
  DEFAULT_PREVIEW_BG,
  DEFAULT_PREVIEW_BORDER,
  recentProjectsMeta,
  type RecentProject,
  setUiState,
  markRecent,
  setLastProject,
  removeRecent,
  fileId,
  loadProject as apiLoadProject,
  saveProject as apiSaveProject,
  lockProject,
  unlockProject,
  SavedSource,
  SourcePath,
  ScriptTemplate,
  Segment,
  SourceInfo,
  ZERO_CROP,
} from "@/lib/tauri";
import { MEDIA_EXTS } from "@/lib/utils";
import { defaultSegments } from "@/lib/frames";
import { toast } from "@/lib/toast";

export interface UiSource {
  id: string;
  path: string | null;
  crop: Crop;
  segments: Segment[];
  deinterlace: boolean;
  deintKernel: DeintKernel;
  deintDouble: boolean;
  dar: string;
  darAlgo: Algo;
  matrix: MatrixSetting;
  range: RangeSetting;
  tonemap: boolean;
  tonemapSrc: TonemapSrc | "";
  tonemapFunc: TonemapFunc;
  tonemapGamut: GamutMapping;
  tonemapPeak: boolean;
  tonemapDstNits: number | null;
  tonemapSrcNits: number | null;
  tonemapUseDovi: boolean;
  name: string;
  info: SourceInfo | null;
  vsprobing: boolean;
  indexProgress: number | null;
  error: string | null;
}

export interface Settings {
  comparisons: number[];
  upscaleSmallest: boolean;
  upscaleAlgo: Algo;
  downscaleLargest: boolean;
  downscaleAlgo: Algo;
  cropToSmallest: boolean;
  padToLargest: boolean;
  gutterWidth: number;
  sources: UiSource[];
}

const emptySource = (): UiSource => ({
  id: crypto.randomUUID(),
  path: null,
  crop: { ...ZERO_CROP },
  segments: [],
  deinterlace: false,
  deintKernel: "bwdif",
  deintDouble: false,
  dar: "",
  darAlgo: "Lanczos3",
  matrix: "",
  range: "",
  tonemap: false,
  tonemapSrc: "",
  tonemapFunc: "spline",
  tonemapGamut: "perceptual",
  tonemapPeak: true,
  tonemapDstNits: null,
  tonemapSrcNits: null,
  tonemapUseDovi: true,
  name: "",
  info: null,
  vsprobing: false,
  indexProgress: null,
  error: null,
});

export const PROJECT_EXT = "pcp";

function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => ({
    comparisons: [],
    upscaleSmallest: false,
    upscaleAlgo: "Triangle",
    downscaleLargest: false,
    downscaleAlgo: "Lanczos3",
    cropToSmallest: false,
    padToLargest: false,
    gutterWidth: 120,
    sources: [],
  }));

  const [templates, setTemplates] = useState<ScriptTemplate[]>([]);
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>("");
  const [appSettings, setAppSettings] = useState<AppSettings>({
    defaultCount: 20,
    minDistance: 5,
    marginStart: 0.02,
    marginEnd: 0.02,
    match: "Any",
    orderedComparisons: false,
    defaultZoom: "fit",
    pixelPerfect: false,
    zoomAlgo: "auto",
    fullscreenMode: "fullscreen",
    fullscreenIncludes: {
      tabs: false,
      framestrip: false,
      seekbar: true,
      timeline: false,
      markup: false,
    },
    infoBoxPosition: "top-left",
    infoBoxScale: 100,
    weaveFrames: 1,
    watermark: true,
    previewBg: DEFAULT_PREVIEW_BG,
    previewBorder: DEFAULT_PREVIEW_BORDER,
    hwdevice: "",
    hwfallback: true,
  });
  const [restoreUi, setRestoreUi] = useState<{
    tab: string;
    previewMode: string;
    base: number;
    lastProject: string;
  }>({
    tab: "preview",
    previewMode: "single",
    base: 0,
    lastProject: "",
  });
  const [prefsReady, setPrefsReady] = useState(false);
  const savedSnapshot = useRef<string | null>(null);
  const settingsRef = useRef(settings);
  const appSettingsRef = useRef(appSettings);
  useEffect(() => {
    settingsRef.current = settings;
    appSettingsRef.current = appSettings;
  });
  const vsprobeRef = useRef<(src: UiSource) => void>(() => {});
  const savedSources = useRef<Record<SourcePath, SavedSource>>({});
  const loaded = useRef(false);

  const refreshRecents = useCallback(async () => {
    try {
      setRecents(await recentProjectsMeta());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const prefs = await loadPrefs();
        setTemplates(prefs.templates ?? []);
        await refreshRecents();
        setAppSettings({
          defaultCount: prefs.defaultCount ?? 20,
          minDistance: prefs.minDistance ?? 5,
          marginStart: prefs.margin?.start ?? 0.02,
          marginEnd: prefs.margin?.end ?? 0.02,
          match: kindToMatch(prefs.match),
          orderedComparisons: prefs.orderedComparisons ?? false,
          defaultZoom: prefs.defaultZoom ?? "fit",
          pixelPerfect: prefs.pixelPerfect ?? false,
          zoomAlgo: prefs.zoomAlgo ?? "auto",
          fullscreenMode: prefs.fullscreenMode ?? "fullscreen",
          fullscreenIncludes: {
            tabs: prefs.fullscreenIncludes?.tabs ?? false,
            framestrip: prefs.fullscreenIncludes?.framestrip ?? false,
            seekbar: prefs.fullscreenIncludes?.seekbar ?? true,
            timeline: prefs.fullscreenIncludes?.timeline ?? false,
            markup: prefs.fullscreenIncludes?.markup ?? false,
          },
          infoBoxPosition: prefs.infoBoxPosition ?? "top-left",
          infoBoxScale: prefs.infoBoxScale ?? 100,
          weaveFrames: Math.max(1, Math.floor(prefs.weaveFrames ?? 1)),
          watermark: prefs.watermark ?? true,
          previewBg: { ...DEFAULT_PREVIEW_BG, ...(prefs.previewBg ?? {}) },
          previewBorder: { ...DEFAULT_PREVIEW_BORDER, ...(prefs.previewBorder ?? {}) },
          hwdevice: (prefs.hwdevice ?? "") as AppSettings["hwdevice"],
          hwfallback: prefs.hwfallback ?? true,
        });
        void setHwdevice((prefs.hwdevice ?? "") as AppSettings["hwdevice"]);
        void setHwfallback(prefs.hwfallback ?? true);
        setRestoreUi({
          tab: prefs.lastTab ?? "preview",
          previewMode: prefs.previewMode ?? "single",
          base: prefs.seekBase ?? 0,
          lastProject: prefs.lastProject ?? "",
        });
      } finally {
        loaded.current = true;
        setPrefsReady(true);
      }
    })();
  }, []);

  const saveUiState = useCallback((tab: string, previewMode: string, base: number) => {
    void setUiState(tab, previewMode, base);
  }, []);

  const saveAppSettings = useCallback(async (next: AppSettings) => {
    const hwChanged = next.hwdevice !== appSettingsRef.current.hwdevice;
    const fallbackChanged = next.hwfallback !== appSettingsRef.current.hwfallback;
    await saveSettings(next);
    setAppSettings(next);
    if (hwChanged) await setHwdevice(next.hwdevice);
    if (fallbackChanged) await setHwfallback(next.hwfallback);
    if (hwChanged || fallbackChanged) {
      for (const s of settingsRef.current.sources) {
        if (s.path) vsprobeRef.current(s);
      }
    }
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    void saveTemplates(templates);
  }, [templates]);

  const updateSource = useCallback((id: string, fn: (src: UiSource) => UiSource) => {
    setSettings((s) => ({
      ...s,
      sources: s.sources.map((src) => (src.id === id ? fn(src) : src)),
    }));
  }, []);

  const vsprobe = useCallback(
    async (input: UiSource) => {
      const { id, path } = input;
      if (!path) return;
      updateSource(id, (src) => ({
        ...src,
        vsprobing: true,
        indexProgress: null,
        error: null,
      }));
      try {
        const res = await initSource(
          path,
          input.deinterlace,
          input.deintKernel,
          input.deintDouble,
          input.dar,
          input.matrix,
          input.range,
          input.tonemapSrc,
          input.tonemap,
        );
        setSettings((s) => ({
          ...s,
          sources: s.sources.map((src) => {
            if (src.id !== id || src.path !== path) return src;
            const segments =
              src.segments.length > 0 ? src.segments : defaultSegments(res.info.total);
            return {
              ...src,
              info: res.info,
              segments,
              dar: res.dar,
              matrix: res.matrix,
              range: res.range,
              tonemap: res.tonemap,
              tonemapSrc: res.tonemapSrc,
              vsprobing: false,
              indexProgress: null,
            };
          }),
        }));
      } catch (e) {
        setSettings((s) => ({
          ...s,
          sources: s.sources.map((src) =>
            src.id === id && src.path === path
              ? { ...src, vsprobing: false, indexProgress: null, error: String(e) }
              : src,
          ),
        }));
      }
    },
    [updateSource],
  );
  useEffect(() => {
    vsprobeRef.current = vsprobe;
  });

  useEffect(() => {
    const un = listen<IndexEvent>("vs-index", (e) => {
      const { path, percent } = e.payload;
      setSettings((s) => ({
        ...s,
        sources: s.sources.map((src) =>
          src.path === path ? { ...src, indexProgress: percent } : src,
        ),
      }));
    });
    return () => {
      void un.then((f) => f());
    };
  }, []);

  const setSourcePath = useCallback(
    async (id: string, path: string) => {
      if (settingsRef.current.sources.some((s) => s.id !== id && s.path === path)) {
        toast({
          kind: "error",
          msg: "That file is already loaded as another source - the same file can't be compared with itself.",
        });
        return;
      }
      await clearCache();
      const src: UiSource = { ...applySaved(path, savedSources.current), id };
      updateSource(id, () => src);
      void vsprobe(src);
    },
    [vsprobe, updateSource],
  );

  const addSources = useCallback(
    async (paths: string[]) => {
      const seen = new Set(
        settingsRef.current.sources.flatMap((s) => (s.path ? [s.path] : [])),
      );
      const fresh: string[] = [];
      for (const path of paths) {
        if (seen.has(path)) continue;
        seen.add(path);
        fresh.push(path);
      }
      const skipped = paths.length - fresh.length;
      if (skipped > 0)
        toast({
          kind: "error",
          msg: `Skipped ${skipped} file${skipped > 1 ? "s" : ""} already added - the same file can't be compared with itself.`,
        });
      if (fresh.length === 0) return;
      const created = fresh.map((path) => applySaved(path, savedSources.current));
      setSettings((s) => ({ ...s, sources: [...s.sources, ...created] }));
      for (const src of created) if (src.path) void vsprobe(src);
    },
    [vsprobe],
  );

  const pickSources = useCallback(async () => {
    const selected = await open({
      directory: false,
      multiple: true,
      title: "Add sources",
      filters: [
        { name: "Video / image files", extensions: MEDIA_EXTS },
        { name: "All files", extensions: ["*"] },
      ],
    });
    const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
    if (paths.length) await addSources(paths);
  }, [addSources]);

  const removeSource = useCallback((id: string) => {
    setSettings((s) => ({ ...s, sources: s.sources.filter((src) => src.id !== id) }));
  }, []);

  const reorderSources = useCallback((from: number, to: number) => {
    setSettings((s) => {
      const n = s.sources.length;
      if (from === to || from < 0 || to < 0 || from >= n || to >= n) return s;
      const next = [...s.sources];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...s, sources: next };
    });
  }, []);

  const readProject = useCallback((path: string) => apiLoadProject(path), []);

  const applyProject = useCallback(
    async (cfg: Config, path: string) => {
      await clearCache();
      savedSources.current = cfg.sources ?? {};
      const sourceKeys = Object.keys(savedSources.current);
      const base = settingsRef.current;
      const applied: Settings = {
        ...base,
        comparisons: cfg.comparisons ?? [],
        upscaleSmallest: cfg.upscale?.enabled ?? false,
        upscaleAlgo: cfg.upscale?.algorithm || "Triangle",
        downscaleLargest: cfg.downscale?.enabled ?? false,
        downscaleAlgo: cfg.downscale?.algorithm || "Lanczos3",
        cropToSmallest: cfg.cropToSmallest ?? false,
        padToLargest: cfg.padToLargest ?? false,
        gutterWidth: cfg.gutterWidth ?? 120,
        sources: sourceKeys.map((k) => applySaved(k, savedSources.current)),
      };
      setSettings(applied);
      savedSnapshot.current = dirtyBasis(toConfig(applied, savedSources.current));
      setProjectPath(path);
      setProjectName(cfg.name ?? "");
      for (const src of applied.sources) if (src.path) void vsprobe(src);
      void markRecent(path);
      void setLastProject(path);
      void lockProject(path).catch(() => {});
      void refreshRecents();
    },
    [vsprobe, refreshRecents],
  );

  const saveProject = useCallback(
    async (path: string, name: string, thumbnail = "") => {
      const s = settingsRef.current;
      const cfg = toConfig(s, savedSources.current);
      const snapshot = dirtyBasis(cfg);
      await Promise.all(
        Object.keys(cfg.sources).map(async (p) => {
          try {
            const fid = await fileId(p);
            cfg.sources[p] = { ...cfg.sources[p], size: fid.size, id: fid.id };
          } catch {
            /* leave 0/"" if it can't be fingerprinted */
          }
        }),
      );
      await apiSaveProject(path, { ...cfg, name, thumbnail });
      savedSnapshot.current = snapshot;
      setProjectPath(path);
      setProjectName(name);
      await setLastProject(path);
      void lockProject(path).catch(() => {});
      void refreshRecents();
    },
    [refreshRecents],
  );

  const removeRecentPath = useCallback(
    async (path: string) => {
      await removeRecent(path);
      await refreshRecents();
    },
    [refreshRecents],
  );

  const closeProject = useCallback(async () => {
    const paths = settingsRef.current.sources
      .map((s) => s.path)
      .filter((p): p is string => !!p);
    await clearCache();
    savedSources.current = {};
    savedSnapshot.current = null;
    setSettings((s) => ({ ...s, sources: [], comparisons: [] }));
    setProjectPath(null);
    setProjectName("");
    void setLastProject("");
    void unlockProject();
    if (paths.length) void discardIndexes(paths);
  }, []);

  const setComparisons = useCallback((positions: number[]) => {
    setSettings((s) => ({ ...s, comparisons: positions }));
  }, []);
  const appendComparisons = useCallback((positions: number[]) => {
    if (!positions.length) return;
    setSettings((s) => ({ ...s, comparisons: [...s.comparisons, ...positions] }));
  }, []);
  const deleteComparisonAt = useCallback((index: number) => {
    setSettings((s) => ({
      ...s,
      comparisons: s.comparisons.filter((_, i) => i !== index),
    }));
  }, []);

  const patch = useCallback((p: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...p }));
  }, []);

  const setSegments = useCallback(
    (id: string, segments: Segment[]) => {
      updateSource(id, (src) => {
        const next = { ...src, segments };
        if (next.path) rememberSource(savedSources, next);
        return next;
      });
    },
    [updateSource],
  );

  const setCrop = useCallback(
    (id: string, crop: Crop) => {
      updateSource(id, (src) => {
        const next = { ...src, crop };
        if (next.path) rememberSource(savedSources, next);
        return next;
      });
    },
    [updateSource],
  );

  const setDar = useCallback(
    (id: string, dar: string) => {
      updateSource(id, (src) => {
        const next = { ...src, dar };
        if (next.path) rememberSource(savedSources, next);
        return next;
      });
    },
    [updateSource],
  );

  const setDarAlgo = useCallback(
    (id: string, darAlgo: Algo) => {
      updateSource(id, (src) => {
        const next = { ...src, darAlgo };
        if (next.path) rememberSource(savedSources, next);
        return next;
      });
    },
    [updateSource],
  );

  const setMatrix = useCallback(
    (id: string, matrix: Matrix) => {
      updateSource(id, (src) => {
        const next = { ...src, matrix };
        if (next.path) rememberSource(savedSources, next);
        return next;
      });
    },
    [updateSource],
  );

  const setRange = useCallback(
    (id: string, range: Range) => {
      updateSource(id, (src) => {
        const next = { ...src, range };
        if (next.path) rememberSource(savedSources, next);
        return next;
      });
    },
    [updateSource],
  );

  const patchTonemap = useCallback(
    (id: string, patch: Partial<UiSource>) => {
      updateSource(id, (src) => {
        const next = { ...src, ...patch };
        if (next.path) rememberSource(savedSources, next);
        return next;
      });
    },
    [updateSource],
  );
  const setTonemap = useCallback(
    (id: string, on: boolean) => patchTonemap(id, { tonemap: on }),
    [patchTonemap],
  );
  const setTonemapSrc = useCallback(
    (id: string, src: TonemapSrc) => patchTonemap(id, { tonemapSrc: src }),
    [patchTonemap],
  );
  const setTonemapFunc = useCallback(
    (id: string, func: TonemapFunc) => patchTonemap(id, { tonemapFunc: func }),
    [patchTonemap],
  );
  const setTonemapGamut = useCallback(
    (id: string, gamut: GamutMapping) => patchTonemap(id, { tonemapGamut: gamut }),
    [patchTonemap],
  );
  const setTonemapPeak = useCallback(
    (id: string, peak: boolean) => patchTonemap(id, { tonemapPeak: peak }),
    [patchTonemap],
  );
  const setTonemapDstNits = useCallback(
    (id: string, nits: number | null) => patchTonemap(id, { tonemapDstNits: nits }),
    [patchTonemap],
  );
  const setTonemapSrcNits = useCallback(
    (id: string, nits: number | null) => patchTonemap(id, { tonemapSrcNits: nits }),
    [patchTonemap],
  );
  const setTonemapUseDovi = useCallback(
    (id: string, on: boolean) => patchTonemap(id, { tonemapUseDovi: on }),
    [patchTonemap],
  );

  const setSourceName = useCallback(
    (id: string, name: string) => {
      updateSource(id, (src) => {
        const next = { ...src, name };
        if (next.path) rememberSource(savedSources, next);
        return next;
      });
    },
    [updateSource],
  );

  const setDeinterlace = useCallback(
    (id: string, deinterlace: boolean) => {
      const cur = settingsRef.current.sources.find((x) => x.id === id);
      if (!cur || cur.deinterlace === deinterlace) return;
      updateSource(id, (src) => {
        const next = { ...src, deinterlace, info: null };
        if (next.path) rememberSource(savedSources, next);
        return next;
      });
      if (cur.path) {
        void clearCache().then(() => vsprobe({ ...cur, deinterlace, info: null }));
      }
    },
    [vsprobe, updateSource],
  );

  const setDeintDouble = useCallback(
    (id: string, deintDouble: boolean) => {
      const cur = settingsRef.current.sources.find((x) => x.id === id);
      if (!cur || cur.deintDouble === deintDouble) return;
      updateSource(id, (src) => {
        const next = { ...src, deintDouble, info: null };
        if (next.path) rememberSource(savedSources, next);
        return next;
      });
      if (cur.path) {
        void clearCache().then(() => vsprobe({ ...cur, deintDouble, info: null }));
      }
    },
    [vsprobe, updateSource],
  );

  const setDeintKernel = useCallback(
    (id: string, deintKernel: DeintKernel) => {
      const cur = settingsRef.current.sources.find((x) => x.id === id);
      if (!cur || cur.deintKernel === deintKernel) return;
      updateSource(id, (src) => {
        const next = { ...src, deintKernel };
        if (next.path) rememberSource(savedSources, next);
        return next;
      });
    },
    [updateSource],
  );

  const saveTemplate = useCallback((name: string, script: string) => {
    setTemplates((ts) => {
      const others = ts.filter((t) => t.name !== name);
      return [...others, { name, script }].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
    });
  }, []);

  const deleteTemplate = useCallback((name: string) => {
    setTemplates((ts) => ts.filter((t) => t.name !== name));
  }, []);

  const currentConfigStr = dirtyBasis(toConfig(settings, savedSources.current));
  const dirty =
    savedSnapshot.current === null ? true : currentConfigStr !== savedSnapshot.current;

  return {
    settings,
    templates,
    recents,
    projectPath,
    projectName,
    dirty,
    appSettings,
    saveAppSettings,
    restoreUi,
    saveUiState,
    prefsReady,
    patch,
    pickSources,
    addSources,
    removeSource,
    reorderSources,
    setSourcePath,
    setSegments,
    setCrop,
    setDeinterlace,
    setDeintKernel,
    setDeintDouble,
    setDar,
    setDarAlgo,
    setMatrix,
    setRange,
    setTonemap,
    setTonemapSrc,
    setTonemapFunc,
    setTonemapGamut,
    setTonemapPeak,
    setTonemapDstNits,
    setTonemapSrcNits,
    setTonemapUseDovi,
    setSourceName,
    setComparisons,
    appendComparisons,
    deleteComparisonAt,
    saveTemplate,
    deleteTemplate,
    readProject,
    applyProject,
    saveProject,
    removeRecentPath,
    closeProject,
  };
}

function deintToOpt(src: UiSource): DeinterlaceOpt {
  return { enabled: src.deinterlace, kernel: src.deintKernel, double: src.deintDouble };
}
function tonemapToOpt(src: UiSource): TonemapOpt {
  return {
    enabled: src.tonemap,
    src: src.tonemapSrc,
    func: src.tonemapFunc,
    gamut: src.tonemapGamut,
    peak: src.tonemapPeak,
    dstNits: src.tonemapDstNits,
    srcNits: src.tonemapSrcNits,
    useDovi: src.tonemapUseDovi,
  };
}
function kindToMatch(k: MatchKind | undefined): FrameMatch {
  return k ? (k.toUpperCase() as FrameMatch) : "Any";
}

function applySaved(
  path: string | null | undefined,
  saved: Record<SourcePath, SavedSource>,
): UiSource {
  if (!path) return emptySource();
  const s = saved[path];
  return {
    id: crypto.randomUUID(),
    path,
    crop: s?.crop ? { ...s.crop } : { ...ZERO_CROP },
    segments: s?.segments ? s.segments.map((x) => ({ ...x, id: crypto.randomUUID() })) : [],
    deinterlace: s?.deinterlace?.enabled ?? false,
    deintKernel: s?.deinterlace?.kernel ?? "bwdif",
    deintDouble: s?.deinterlace?.double ?? false,
    dar: s?.dar ?? "",
    darAlgo: s?.darAlgo || "Lanczos3",
    matrix: s?.matrix ?? "",
    range: s?.range ?? "",
    tonemap: s?.tonemap?.enabled ?? false,
    tonemapSrc: s?.tonemap ? s.tonemap.src : "",
    tonemapFunc: s?.tonemap?.func ?? "spline",
    tonemapGamut: s?.tonemap?.gamut ?? "perceptual",
    tonemapPeak: s?.tonemap?.peak ?? true,
    tonemapDstNits: s?.tonemap?.dstNits ?? null,
    tonemapSrcNits: s?.tonemap?.srcNits ?? null,
    tonemapUseDovi: s?.tonemap?.useDovi ?? true,
    name: s?.name ?? "",
    info: null,
    vsprobing: false,
    indexProgress: null,
    error: null,
  };
}

function rememberSource(
  saved: React.MutableRefObject<Record<SourcePath, SavedSource>>,
  src: UiSource,
) {
  if (!src.path) return;
  const prev = saved.current[src.path];
  saved.current = {
    ...saved.current,
    [src.path]: {
      crop: src.crop,
      segments: src.segments,
      size: prev?.size ?? 0,
      id: prev?.id ?? "",
      deinterlace: deintToOpt(src),
      tonemap: tonemapToOpt(src),
      dar: src.dar,
      darAlgo: src.darAlgo,
      matrix: src.matrix,
      range: src.range,
      name: src.name,
    },
  };
}

function toConfig(s: Settings, _saved: Record<SourcePath, SavedSource>): Config {
  const sources: Record<SourcePath, SavedSource> = {};
  for (const src of s.sources) {
    if (src.path)
      sources[src.path] = {
        crop: src.crop,
        segments: src.segments,
        size: 0,
        id: "",
        deinterlace: deintToOpt(src),
        tonemap: tonemapToOpt(src),
        dar: src.dar,
        darAlgo: src.darAlgo,
        matrix: src.matrix,
        range: src.range,
        name: src.name,
      };
  }
  return {
    comparisons: s.comparisons,
    upscale: { enabled: s.upscaleSmallest, algorithm: s.upscaleAlgo },
    downscale: { enabled: s.downscaleLargest, algorithm: s.downscaleAlgo },
    cropToSmallest: s.cropToSmallest,
    padToLargest: s.padToLargest,
    gutterWidth: s.gutterWidth,
    sources,
    name: "",
    thumbnail: "",
    created: 0,
    modified: 0,
    version: "",
  };
}

/** `stableStringify` sorts object keys, so the source order encoded in `sources`' key
 *  order would be lost - represent it as an ordered [path, value] array so a reorder is
 *  detected as a change. */
function dirtyBasis(cfg: Config): string {
  const { sources, ...rest } = cfg;
  return stableStringify({ ...rest, sources: Object.entries(sources) });
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const obj = v as Record<string, unknown>;
  return (
    "{" +
    Object.keys(obj)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k]))
      .join(",") +
    "}"
  );
}

type UseSettings = ReturnType<typeof useSettings>;

export type AppSettingsValue = Pick<UseSettings, "appSettings" | "saveAppSettings">;
export type ProjectValue = Omit<UseSettings, "appSettings" | "saveAppSettings">;

const SettingsContext = createContext<AppSettingsValue | null>(null);
const ProjectContext = createContext<ProjectValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const all = useSettings();
  const settingsValue = useMemo<AppSettingsValue>(
    () => ({ appSettings: all.appSettings, saveAppSettings: all.saveAppSettings }),
    [all.appSettings, all.saveAppSettings],
  );
  return (
    <SettingsContext.Provider value={settingsValue}>
      <ProjectContext.Provider value={all}>{children}</ProjectContext.Provider>
    </SettingsContext.Provider>
  );
}

export function useAppSettings(): AppSettingsValue {
  const c = useContext(SettingsContext);
  if (!c) throw new Error("useAppSettings must be used within an AppStateProvider");
  return c;
}

export function useProject(): ProjectValue {
  const c = useContext(ProjectContext);
  if (!c) throw new Error("useProject must be used within an AppStateProvider");
  return c;
}
