import {
  Circle,
  Eraser,
  Highlighter,
  MoveUpRight,
  Pen,
  Redo2,
  Slash,
  Square,
  Trash2,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MarkupTool } from "@/lib/markup";

const COLORS = [
  "#ff3b3b",
  "#ffd400",
  "#33ff77",
  "#33d6ff",
  "#c77dff",
  "#ffffff",
  "#111111",
];

interface Props {
  tool: MarkupTool | null;
  setTool: (t: MarkupTool | null) => void;
  color: string;
  setColor: (c: string) => void;
  size: number;
  setSize: (s: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  canUndo: boolean;
  canRedo: boolean;
  hasMarkup: boolean;
  disabled: boolean;
  className?: string;
}

export function MarkupToolbar(p: Props) {
  const sizePx = Math.round(p.size * 1000);
  const toggle = (t: MarkupTool) => p.setTool(p.tool === t ? null : t);

  return (
    <div className={cn("flex h-full items-center", p.className)}>
      <div
        className={cn(
          "flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap px-2",
          p.disabled && "pointer-events-none opacity-40",
        )}
      >
        <Tool active={p.tool === "pen"} onClick={() => toggle("pen")} title="Ballpoint pen">
          <Pen className="size-4" />
        </Tool>
        <Tool active={p.tool === "highlighter"} onClick={() => toggle("highlighter")} title="Highlighter">
          <Highlighter className="size-4" />
        </Tool>
        <Tool active={p.tool === "eraser"} onClick={() => toggle("eraser")} title="Eraser">
          <Eraser className="size-4" />
        </Tool>
        <Divider />
        <Tool active={p.tool === "rect"} onClick={() => toggle("rect")} title="Rectangle">
          <Square className="size-4" />
        </Tool>
        <Tool active={p.tool === "ellipse"} onClick={() => toggle("ellipse")} title="Ellipse">
          <Circle className="size-4" />
        </Tool>
        <Tool active={p.tool === "arrow"} onClick={() => toggle("arrow")} title="Arrow">
          <MoveUpRight className="size-4" />
        </Tool>
        <Tool active={p.tool === "line"} onClick={() => toggle("line")} title="Line">
          <Slash className="size-4" />
        </Tool>
        <Divider />
        <div className="flex shrink-0 items-center gap-1 px-1">
          {COLORS.map((c) => (
            <button
              key={c}
              title={c}
              onClick={() => p.setColor(c)}
              className={cn(
                "size-4 shrink-0 border transition-transform",
                p.color === c
                  ? "scale-110 border-white ring-1 ring-white"
                  : "border-white/25 hover:scale-110",
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <Divider />
        <input
          type="range"
          min={1}
          max={40}
          value={sizePx}
          onChange={(e) => p.setSize(Number(e.target.value) / 1000)}
          title="Stroke size"
          className="h-1 w-20 shrink-0 cursor-pointer accent-primary"
        />
      </div>

      <div className="flex h-full shrink-0 items-center gap-1 border-l border-border px-2">
        <Tool onClick={p.onUndo} disabled={p.disabled || !p.canUndo} title="Undo">
          <Undo2 className="size-4" />
        </Tool>
        <Tool onClick={p.onRedo} disabled={p.disabled || !p.canRedo} title="Redo">
          <Redo2 className="size-4" />
        </Tool>
        <Tool onClick={p.onClear} disabled={p.disabled || !p.hasMarkup} title="Clear markup" danger>
          <Trash2 className="size-4" />
        </Tool>
      </div>
    </div>
  );
}

function Tool({
  active,
  danger,
  disabled,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center outline-none transition-colors",
        "disabled:opacity-30",
        active
          ? "bg-primary text-primary-foreground"
          : danger
            ? "text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
}
