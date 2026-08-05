import { createPortal } from "react-dom";
import { Copy, MoveHorizontal, Pencil, RotateCcw, Scissors, Trash2 } from "lucide-react";
import type { Menu, Sel } from "@/lib/timeline";
import type { TimelineEditing } from "@/hooks/useTimelineEditing";

interface ContextMenuProps {
  menu: Menu | null;
  setMenu: (m: Menu | null) => void;
  base: number;
  sourceIds: string[];
  setRenaming: (s: Sel | null) => void;
  edit: TimelineEditing;
}

export function SegmentContextMenu({
  menu,
  setMenu,
  base,
  sourceIds,
  setRenaming,
  edit,
}: ContextMenuProps) {
  if (!menu) return null;
  const { segsOf, razorAt, alignStartTo, duplicateSeg, deleteSeg, setName } = edit;
  const seg = segsOf(menu.id)[menu.index];
  if (!seg) return null;
  const menuTag = String.fromCharCode(65 + Math.max(0, sourceIds.indexOf(menu.id)));
  const inside = base >= seg.pos && base < seg.pos + seg.len;
  const mx = Math.min(menu.x, window.innerWidth - 216);
  const my = Math.min(menu.y, window.innerHeight - 320);
  const close = () => setMenu(null);
  const item = (
    icon: React.ReactNode,
    label: string,
    onClick: () => void,
    disabled?: boolean,
  ) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        onClick();
        close();
      }}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-foreground/90 outline-none hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {icon}
      {label}
    </button>
  );
  return createPortal(
    <>
      <div
        role="presentation"
        className="fixed inset-0 z-[95]"
        onMouseDown={close}
        onContextMenu={(e) => {
          e.preventDefault();
          close();
        }}
      />
      <div
        className="fixed z-[96] min-w-[200px] border border-border bg-popover py-1 shadow-xl shadow-black/50"
        style={{ left: mx, top: my }}
      >
        <div className="truncate px-3 py-1 font-mono text-[10px] text-muted-foreground/60">
          {menuTag} · #{seg.src}–{seg.src + seg.len - 1}
          {seg.name ? ` · ${seg.name}` : ""}
        </div>
        {item(<Pencil className="size-3.5" />, "Rename…", () =>
          setRenaming({ id: menu.id, index: menu.index }),
        )}
        {seg.name
          ? item(<RotateCcw className="size-3.5" />, "Clear name", () =>
              setName(menu.id, menu.index, ""),
            )
          : null}
        <div className="my-1 h-px bg-border" />
        {item(
          <Scissors className="size-3.5" />,
          "Split at playhead",
          () => razorAt(menu.id, base),
          !inside,
        )}
        {item(<MoveHorizontal className="size-3.5" />, "Move start to playhead", () =>
          alignStartTo(menu.id, menu.index, base),
        )}
        {item(<RotateCcw className="size-3.5" />, "Reset offset (start at 0)", () =>
          alignStartTo(menu.id, menu.index, 0),
        )}
        {item(<Copy className="size-3.5" />, "Duplicate", () =>
          duplicateSeg(menu.id, menu.index),
        )}
        <div className="my-1 h-px bg-border" />
        {item(
          <Trash2 className="size-3.5" />,
          "Delete",
          () => deleteSeg(menu.id, menu.index),
          segsOf(menu.id).length <= 1,
        )}
      </div>
    </>,
    document.body,
  );
}
