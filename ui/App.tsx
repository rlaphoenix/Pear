import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { type PreviewTabHandle } from "@/components/tabs/preview/PreviewTab";
import { StatusBar } from "@/components/StatusBar";
import { useAppSettings, useProject } from "@/state/AppState";
import { useTimebase } from "@/state/TimebaseContext";
import { usePreview } from "@/state/PreviewContext";
import { toast } from "@/lib/toast";
import { useIndexingStatus } from "@/hooks/useIndexingStatus";
import { cn } from "@/lib/utils";
import { DEFAULT_SCRIPT, saveAll, TAB_IDS, type ComparisonIndex, type DataUrl, type SourceId, type TabId } from "@/lib/tauri";
import { type PreviewMode } from "@/lib/preview";
import { exportMarkup } from "@/lib/markup";
import { useGenParams } from "@/hooks/useGenParams";
import { useComparisons } from "@/hooks/useComparisons";
import { usePreviewRender } from "@/hooks/usePreviewRender";
import { useMarkup } from "@/hooks/useMarkup";
import { useComparisonsResize } from "@/hooks/useComparisonsResize";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useFullscreen } from "@/hooks/useFullscreen";
import { useDragDrop } from "@/hooks/useDragDrop";
import { useProjectOpen } from "@/hooks/useProjectOpen";
import { useProjectLifecycle } from "@/hooks/useProjectLifecycle";
import { TitleBar } from "@/components/TitleBar";
import { Tabs } from "@/components/tabs/Tabs";
import { DragDropOverlay } from "@/components/DragDropOverlay";
import { Modals } from "@/components/modals/Modals";

export default function App() {
  const { appSettings, saveAppSettings } = useAppSettings();
  const {
    settings,
    recents,
    projectPath,
    projectName,
    dirty,
    restoreUi,
    saveUiState,
    prefsReady,
    pickSources,
    addSources,
    setComparisons,
    appendComparisons,
    deleteComparisonAt,
    readProject,
    applyProject,
    saveProject,
    removeRecentPath,
    closeProject,
  } = useProject();
  const { base } = useTimebase();
  const {
    mode: previewMode,
    setMode: setPreviewMode,
    sourceIndex,
    fullscreen,
    setFullscreen,
  } = usePreview();

  const [tab, setTab] = useState<TabId>("preview");
  const [scripts, setScripts] = useState<Record<SourceId, string>>({});
  const scriptFor = useCallback((id: SourceId) => scripts[id] ?? DEFAULT_SCRIPT, [scripts]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [, setSaving] = useState(false);
  const previewRef = useRef<PreviewTabHandle>(null);

  const sources = settings.sources;
  const indexingStatus = useIndexingStatus(sources);
  const readySources = sources.filter((s) => s.path);
  const ready = readySources.length >= 1;
  const hasAnySource = sources.length >= 1;

  const loadingSources = sources.filter((s) => s.path && !s.error && (s.vsprobing || !s.info));
  const initializing = loadingSources.length > 0;
  const loadDetail =
    loadingSources.length === 0
      ? null
      : loadingSources.length > 1
        ? `Analyzing ${loadingSources.length} sources…`
        : `Analyzing ${loadingSources[0].name || loadingSources[0].path?.split(/[\\/]/).pop() || "source"}…`;

  const comparisons = useMemo(
    () =>
      appSettings.orderedComparisons
        ? [...settings.comparisons].sort((a, b) => a - b)
        : settings.comparisons,
    [settings.comparisons, appSettings.orderedComparisons],
  );

  const restoredUi = useRef(false);
  useEffect(() => {
    if (restoredUi.current || !prefsReady) return;
    restoredUi.current = true;
    if ((TAB_IDS as string[]).includes(restoreUi.tab)) setTab(restoreUi.tab as TabId);
    if (["single", "split", "juxtapose", "weave"].includes(restoreUi.previewMode))
      setPreviewMode(restoreUi.previewMode as PreviewMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsReady]);

  useGlobalShortcuts();
  useFullscreen({ fullscreen, setFullscreen, fullscreenMode: appSettings.fullscreenMode, tab });
  const dragOver = useDragDrop(addSources);

  const { params, frameKey } = useGenParams(settings, scripts, appSettings);

  const {
    selectedIndex,
    currentPos,
    onSelect,
    onAdd,
    onAddCurrentComparison,
    onDeleteSelected,
    onRerollSelected,
  } = useComparisons({
    comparisons,
    ready,
    initializing,
    params,
    appSettings,
    base,
    setComparisons,
    appendComparisons,
  });

  const { preview, previewLoading, previewError, thumbs } = usePreviewRender({
    params,
    frameKey,
    ready,
    initializing,
    selectedIndex,
    currentPos,
    comparisons,
    sourceIndex,
  });

  const markup = useMarkup(currentPos);
  const resize = useComparisonsResize();
  const update = useUpdateCheck();

  const projectOpen = useProjectOpen({ readProject, applyProject });
  const lifecycle = useProjectLifecycle({
    ready,
    dirty,
    projectPath,
    projectName,
    readySources,
    closeProject,
    setFullscreen,
    saveProject,
    prefsReady,
    saveUiState,
    setScripts,
    beginOpen: projectOpen.beginOpen,
    previewRef,
    tab,
    previewMode,
    base,
  });

  const onSave = useCallback(async () => {
    if (!ready) return;
    const dir = await open({
      directory: true,
      multiple: false,
      title: "Choose export folder",
    });
    if (typeof dir !== "string") return;
    setSaving(true);
    try {
      const overlays: Record<ComparisonIndex, DataUrl> = {};
      if (preview) {
        const { canvasW, canvasH } = preview;
        comparisons.forEach((pos, k) => {
          const st = markup.markups[pos];
          if (st && st.annotations.length > 0)
            overlays[k] = exportMarkup(st.annotations, canvasW, canvasH);
        });
      }
      const res = await saveAll(params, dir, overlays, comparisons);
      toast({ kind: "success", msg: `Exported ${res.files.length} images` });
    } catch (e) {
      toast({ kind: "error", msg: `Export failed: ${String(e)}` });
    } finally {
      setSaving(false);
    }
  }, [params, ready, preview, markup.markups, comparisons]);

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden">
      <div className={cn(fullscreen && !appSettings.fullscreenIncludes.tabs && "hidden")}>
        <TitleBar
          tab={tab}
          setTab={setTab}
          ready={ready}
          initializing={initializing}
          updateState={update.updateState}
          updateVersion={update.update?.version}
          onOpenUpdate={() => update.setUpdateModalOpen(true)}
          previewMode={previewMode}
          setPreviewMode={setPreviewMode}
          onAbout={() => setAboutOpen(true)}
          onSettings={() => setSettingsOpen(true)}
        />
      </div>

      <Tabs
        sources={sources}
        hasAnySource={hasAnySource}
        tab={tab}
        fullscreen={fullscreen}
        appSettings={appSettings}
        params={params}
        frameKey={frameKey}
        ready={ready}
        initializing={initializing}
        indexingStatus={indexingStatus}
        loadDetail={loadDetail}
        previewRef={previewRef}
        onAddCurrentComparison={onAddCurrentComparison}
        scriptFor={scriptFor}
        setScripts={setScripts}
        onAddSources={pickSources}
        onLoadProject={projectOpen.onLoadProject}
        recents={recents}
        onOpenRecent={projectOpen.beginOpen}
        onRemoveRecent={removeRecentPath}
        preview={preview}
        previewLoading={previewLoading}
        previewError={previewError}
        markup={markup}
        onExport={onSave}
        resize={resize}
        comparisons={comparisons}
        thumbs={thumbs}
        selectedIndex={selectedIndex}
        onSelect={onSelect}
        onAdd={onAdd}
        onDelete={deleteComparisonAt}
        onDeleteSelected={onDeleteSelected}
        onRerollSelected={onRerollSelected}
      />

      <StatusBar className={cn(fullscreen && "hidden")} />

      {dragOver && <DragDropOverlay />}

      <Modals
        settingsOpen={settingsOpen}
        setSettingsOpen={setSettingsOpen}
        appSettings={appSettings}
        saveAppSettings={saveAppSettings}
        aboutOpen={aboutOpen}
        setAboutOpen={setAboutOpen}
        update={update}
        lifecycle={lifecycle}
        projectOpen={projectOpen}
      />
    </div>
  );
}
