import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { GenParams } from "@/lib/tauri";
import { clampNum } from "@/lib/frames";
import { useProject } from "@/state/AppState";
import { useTimebase } from "@/state/TimebaseContext";
import { usePreview } from "@/state/PreviewContext";
import { GUTTER_MIN, GUTTER_W, measureText, trackLabel } from "@/lib/timeline";
import type { Menu, Sel, Tool } from "@/lib/timeline";
import { useTimelineHistory } from "@/hooks/useTimelineHistory";
import { useTimelineViewport } from "@/hooks/useTimelineViewport";
import { useTimelineEditing } from "@/hooks/useTimelineEditing";
import { TimelineToolbar } from "./timeline/TimelineToolbar";
import { TimelineGutter } from "./timeline/TimelineGutter";
import { TimelineTracks } from "./timeline/TimelineTracks";
import { TimelineScrollbar } from "./timeline/TimelineScrollbar";
import { SegmentContextMenu } from "./timeline/SegmentContextMenu";

interface Props {
  params: GenParams;
  paramsKey: string;
  active: boolean;
}

export function Timeline({ params, paramsKey, active }: Props) {
  const { settings, setSegments, patch } = useProject();
  const sources = settings.sources;
  const gutterWidth = settings.gutterWidth;
  const setGutterWidth = (w: number) => patch({ gutterWidth: w });
  const { base, setBase, maxBase } = useTimebase();
  const { setSourceIndex: onSelectSource } = usePreview();
  const sourceIds = sources.map((s) => s.id);

  const [tool, setTool] = useState<Tool>("select");
  const [ripple, setRipple] = useState(true);
  const [maxGutter, setMaxGutter] = useState(GUTTER_W);
  const gutterW = clampNum(gutterWidth, GUTTER_MIN, maxGutter);
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const abRef = useRef<HTMLSpanElement | null>(null);
  const [sel, setSel] = useState<Sel | null>(null);
  const selRef = useRef(sel);
  useEffect(() => {
    selRef.current = sel;
  });
  const [collapsed, setCollapsed] = useState(false);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [renaming, setRenaming] = useState<Sel | null>(null);

  const history = useTimelineHistory(sources, setSegments);
  const view = useTimelineViewport(sources, setBase, maxBase);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  const idSetKey = [...sourceIds].sort().join("|");
  useEffect(() => {
    history.resetHistory();
    setSel(null);
    setMenu(null);
    setRenaming(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idSetKey]);

  const edit = useTimelineEditing({
    sources,
    setSegments,
    sel,
    setSel,
    selRef,
    ripple,
    base,
    pxPerFrame: view.pxPerFrame,
    snapshot: history.snapshot,
    commitHistory: history.commitHistory,
  });

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (/INPUT|TEXTAREA|SELECT/.test(el.tagName) || el.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        e.shiftKey ? history.redo() : history.undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        history.redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && sel) {
        e.preventDefault();
        edit.deleteSelected();
      } else if (e.key === "b" || e.key === "B") {
        setTool("razor");
      } else if (e.key === "v" || e.key === "V") {
        setTool("select");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, sel, edit.deleteSelected, history.undo, history.redo]);

  // Runs in the capture phase and stops propagation so the preview's own arrow
  // handler (bubble phase) doesn't also move the base.
  useEffect(() => {
    if (!active) return;
    const onArrow = (e: KeyboardEvent) => {
      if (!selRef.current) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el && (/INPUT|TEXTAREA|SELECT/.test(el.tagName) || el.isContentEditable)) return;
      e.preventDefault();
      e.stopPropagation();
      edit.nudgeRef.current(e.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", onArrow, true);
    return () => window.removeEventListener("keydown", onArrow, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const startGutterResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = gutterW;
    const onMove = (ev: PointerEvent) =>
      setGutterWidth(clampNum(startW + (ev.clientX - startX), GUTTER_MIN, maxGutter));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const labels = sources.map((s) => trackLabel(s) || "No source");
  const labelsKey = labels.join("\n");

  useLayoutEffect(() => {
    const el = labelRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const abW = abRef.current?.offsetWidth ?? 9;
    const labelW = Math.max(0, ...labelsKey.split("\n").map((l) => measureText(l, font)));
    const fixed = 8 + 14 + 8 + abW + 8 + 8 + 24 + 18;
    setMaxGutter(Math.max(GUTTER_MIN, Math.ceil(fixed + labelW) + 2));
  }, [labelsKey]);

  const selSeg = sel ? edit.segsOf(sel.id)[sel.index] : null;
  const canSplit = !!selSeg && base > selSeg.pos && base < selSeg.pos + selSeg.len;
  const deleteDisabled = !sel || edit.segsOf(sel.id).length <= 1;

  return (
    <div className="flex shrink-0 flex-col border-t border-border bg-panel">
      <TimelineToolbar
        tool={tool}
        setTool={setTool}
        splitSelected={edit.splitSelected}
        canSplit={canSplit}
        deleteSelected={edit.deleteSelected}
        deleteDisabled={deleteDisabled}
        ripple={ripple}
        setRipple={setRipple}
        undo={history.undo}
        redo={history.redo}
        undoDisabled={history.past.length === 0}
        redoDisabled={history.future.length === 0}
        zoom={view.zoom}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
      />

      <div className={cn(collapsed && "hidden")}>
        <div className="flex">
          <TimelineGutter
            sources={sources}
            labels={labels}
            gutterW={gutterW}
            labelRef={labelRef}
            abRef={abRef}
            onResize={startGutterResize}
          />
          <TimelineTracks
            sources={sources}
            params={params}
            paramsKey={paramsKey}
            base={base}
            tool={tool}
            sel={sel}
            setSel={setSel}
            setMenu={setMenu}
            renaming={renaming}
            setRenaming={setRenaming}
            onSelectSource={onSelectSource}
            view={view}
            edit={edit}
          />
        </div>

        <TimelineScrollbar
          gutterW={gutterW}
          viewW={view.viewW}
          thumbLeft={view.thumbLeft}
          thumbW={view.thumbW}
          startBarDrag={view.startBarDrag}
        />
      </div>

      <SegmentContextMenu
        menu={menu}
        setMenu={setMenu}
        base={base}
        sourceIds={sourceIds}
        setRenaming={setRenaming}
        edit={edit}
      />
    </div>
  );
}
