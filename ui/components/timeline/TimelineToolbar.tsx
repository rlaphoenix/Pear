import {
  ChevronDown,
  MousePointer2,
  Redo2,
  Scissors,
  SplitSquareHorizontal,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/primitives/tooltip";
import { btnCls } from "@/lib/timeline";
import type { Tool } from "@/lib/timeline";

interface ToolbarProps {
  tool: Tool;
  setTool: (t: Tool) => void;
  splitSelected: () => void;
  canSplit: boolean;
  deleteSelected: () => void;
  deleteDisabled: boolean;
  ripple: boolean;
  setRipple: (v: boolean) => void;
  undo: () => void;
  redo: () => void;
  undoDisabled: boolean;
  redoDisabled: boolean;
  zoom: (factor: number) => void;
  collapsed: boolean;
  setCollapsed: (fn: (c: boolean) => boolean) => void;
}

export function TimelineToolbar({
  tool,
  setTool,
  splitSelected,
  canSplit,
  deleteSelected,
  deleteDisabled,
  ripple,
  setRipple,
  undo,
  redo,
  undoDisabled,
  redoDisabled,
  zoom,
  collapsed,
  setCollapsed,
}: ToolbarProps) {
  const toolBtn = (t: Tool, icon: React.ReactNode, name: string, tip: string, hint: string) => (
    <Tooltip label={tip} hint={hint}>
      <button type="button" onClick={() => setTool(t)} className={btnCls(tool === t)}>
        {icon}
        {name}
      </button>
    </Tooltip>
  );

  return (
    <div className="flex h-9 items-center gap-1.5 border-b border-border px-2">
      {toolBtn(
        "select",
        <MousePointer2 className="size-3.5" />,
        "Select",
        "Select (V)",
        "Click a clip to select it; drag its body to move, drag an edge to trim.",
      )}
      {toolBtn(
        "razor",
        <Scissors className="size-3.5" />,
        "Razor",
        "Razor (B)",
        "Click a clip to cut it in two at the pointer. A red guide shows where.",
      )}
      <Tooltip
        label="Split"
        hint="Select a clip, then split it in two at the playhead (the playhead must be inside the selected clip)."
      >
        <button
          type="button"
          onClick={splitSelected}
          disabled={!canSplit}
          className={btnCls()}
        >
          <SplitSquareHorizontal className="size-3.5" />
          Split
        </button>
      </Tooltip>
      <Tooltip label="Delete (Del)" hint="Remove the selected clip. With Ripple on, later clips slide left to fill the gap. A source's last clip can't be deleted — remove the source in the Sources tab instead.">
        <button
          type="button"
          onClick={deleteSelected}
          disabled={deleteDisabled}
          className={btnCls()}
        >
          <Trash2 className="size-3.5" />
          Delete
        </button>
      </Tooltip>
      <Tooltip
        className="ml-auto"
        label="Ripple delete"
        hint="When on, deleting a clip pulls the clips after it left to close the gap."
      >
        <label className="flex cursor-pointer items-center gap-1.5 pl-1 text-xs text-muted-foreground select-none">
          <input
            type="checkbox"
            checked={ripple}
            onChange={(e) => setRipple(e.target.checked)}
            className="accent-primary"
          />
          Ripple
        </label>
      </Tooltip>

      <div className="flex items-center gap-1 pl-1">
        <Tooltip label="Undo (Ctrl+Z)" hint="Step back through clip edits — move, trim, split and delete.">
          <button
            type="button"
            onClick={undo}
            disabled={undoDisabled}
            className="flex h-7 items-center gap-1.5 border border-border px-2 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground disabled:opacity-40"
          >
            <Undo2 className="size-3.5" />
            Undo
          </button>
        </Tooltip>
        <Tooltip label="Redo (Ctrl+Y)" hint="Re-apply an edit you just undid.">
          <button
            type="button"
            onClick={redo}
            disabled={redoDisabled}
            className="flex h-7 items-center gap-1.5 border border-border px-2 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground disabled:opacity-40"
          >
            <Redo2 className="size-3.5" />
            Redo
          </button>
        </Tooltip>
        <Tooltip label="Zoom out" hint="Or hold Ctrl and scroll over the timeline.">
          <button
            type="button"
            onClick={() => zoom(0.7)}
            className="flex size-7 items-center justify-center border border-border text-muted-foreground outline-none hover:text-foreground"
          >
            <ZoomOut className="size-3.5" />
          </button>
        </Tooltip>
        <Tooltip label="Zoom in" hint="Or hold Ctrl and scroll over the timeline.">
          <button
            type="button"
            onClick={() => zoom(1.4)}
            className="flex size-7 items-center justify-center border border-border text-muted-foreground outline-none hover:text-foreground"
          >
            <ZoomIn className="size-3.5" />
          </button>
        </Tooltip>
        <Tooltip label={collapsed ? "Expand timeline" : "Collapse timeline"}>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            className="flex size-7 items-center justify-center border border-border text-muted-foreground outline-none hover:text-foreground"
          >
            <ChevronDown
              className={cn("size-3.5 transition-transform", collapsed && "rotate-180")}
            />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
