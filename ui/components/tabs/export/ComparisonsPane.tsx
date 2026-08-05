import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Dice5, Loader2, Minus, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectFrame, DataUrl } from "@/lib/tauri";

interface Props {
  comparisons: ProjectFrame[];
  thumbs: Record<ProjectFrame, DataUrl>;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onDelete: (index: number) => void;
  onDeleteSelected: (positions: ProjectFrame[]) => void;
  onRerollSelected: (positions: ProjectFrame[]) => void;
  aspect: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function ComparisonsPane({
  comparisons,
  thumbs,
  selectedIndex,
  onSelect,
  onAdd,
  onDelete,
  onDeleteSelected,
  onRerollSelected,
  aspect,
  collapsed,
  onToggleCollapse,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ down: false, startX: 0, startLeft: 0, moved: false, captured: false });
  const [grabbing, setGrabbing] = useState(false);

  const [checked, setChecked] = useState<Set<number>>(new Set());
  const validChecked = useMemo(() => {
    if (checked.size === 0) return checked;
    const valid = new Set(comparisons);
    const next = new Set([...checked].filter((p) => valid.has(p)));
    return next.size === checked.size ? checked : next;
  }, [checked, comparisons]);
  const toggleChecked = (pos: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(pos)) next.delete(pos);
      else next.add(pos);
      return next;
    });
  const clearChecked = () => setChecked(new Set());
  const checkedCount = validChecked.size;
  const allChecked = comparisons.length > 0 && checkedCount === comparisons.length;
  const someChecked = checkedCount > 0 && !allChecked;
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(comparisons));

  const onPointerDown = (e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    drag.current = { down: true, startX: e.clientX, startLeft: el.scrollLeft, moved: false, captured: false };
    setGrabbing(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.down || !scrollRef.current) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) > 4) {
      d.moved = true;
      try {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        d.captured = true;
      } catch {
      }
    }
    if (d.moved) scrollRef.current.scrollLeft = d.startLeft - dx;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (drag.current.captured) {
      try {
        (e.currentTarget as Element).releasePointerCapture(e.pointerId);
      } catch {
      }
    }
    drag.current.down = false;
    drag.current.captured = false;
    setGrabbing(false);
  };

  const handleSelect = (i: number) => {
    if (drag.current.moved) {
      drag.current.moved = false;
      return;
    }
    onSelect(i);
  };

  const handleAdd = () => {
    if (drag.current.moved) {
      drag.current.moved = false;
      return;
    }
    addPending.current = true;
    onAdd();
  };

  const addPending = useRef(false);
  const prevLen = useRef(comparisons.length);
  useLayoutEffect(() => {
    const grew = comparisons.length > prevLen.current;
    prevLen.current = comparisons.length;
    if (addPending.current && grew) {
      addPending.current = false;
      const el = scrollRef.current;
      if (el) el.scrollLeft = el.scrollWidth;
    }
  }, [comparisons.length]);

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border pl-2.5 pr-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={allChecked ? true : someChecked ? "mixed" : false}
          onClick={toggleAll}
          disabled={comparisons.length === 0}
          title={allChecked ? "Deselect all" : "Select all comparisons"}
          className={cn(
            "flex size-[18px] shrink-0 cursor-pointer items-center justify-center border outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            allChecked || someChecked
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input bg-[#0d0d10] text-transparent hover:border-primary/60",
          )}
        >
          {allChecked ? (
            <Check className="size-3" strokeWidth={3} />
          ) : someChecked ? (
            <Minus className="size-3" strokeWidth={3} />
          ) : null}
        </button>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Comparisons
        </span>
        <div className="ml-auto flex items-center gap-1">
          {checkedCount === 0 ? (
            <span className="mr-2 font-mono text-sm text-muted-foreground/80">{comparisons.length}</span>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  onDeleteSelected([...validChecked]);
                  clearChecked();
                }}
                title="Delete the selected comparisons"
                className="flex h-7 cursor-pointer items-center gap-1.5 border border-border px-2.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:border-red-600/60 hover:bg-red-600 hover:text-white"
              >
                <Trash2 className="size-3.5" />
                Delete selected ({checkedCount})
              </button>
              <button
                type="button"
                onClick={() => {
                  onRerollSelected([...validChecked]);
                  clearChecked();
                }}
                title="Re-roll the selected comparisons"
                className="flex h-7 cursor-pointer items-center gap-1.5 border border-border px-2.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:border-primary/60 hover:text-foreground"
              >
                <Dice5 className="size-3.5" />
                Re-roll selected ({checkedCount})
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand comparisons" : "Collapse comparisons"}
            className="ml-1 flex size-7 items-center justify-center border border-border text-muted-foreground outline-none hover:text-foreground"
          >
            <ChevronDown
              className={cn("size-3.5 transition-transform", collapsed && "rotate-180")}
            />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
        <div
          className={cn(
            "group/strip flex h-full flex-row flex-nowrap items-center gap-3 pt-1.5 pr-0 pb-2 pl-3 select-none",
            grabbing ? "cursor-grabbing" : "cursor-grab",
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {comparisons.map((slot, i) => (
            <Tile
              key={slot}
              active={i === selectedIndex}
              src={thumbs[slot]}
              aspect={aspect}
              label={String(i + 1).padStart(2, "0")}
              title={`Comparison ${i + 1}`}
              canDelete={comparisons.length > 1}
              checked={validChecked.has(slot)}
              onToggle={() => toggleChecked(slot)}
              onClick={() => handleSelect(i)}
              onDelete={() => onDelete(i)}
            />
          ))}
          <AddTile aspect={aspect} onClick={handleAdd} />
        </div>
      </div>
    </div>
  );
}

function Tile({
  active,
  src,
  aspect,
  label,
  title,
  canDelete,
  checked,
  onToggle,
  onClick,
  onDelete,
}: {
  active: boolean;
  src?: string;
  aspect: number;
  label: string;
  title: string;
  canDelete: boolean;
  checked: boolean;
  onToggle: () => void;
  onClick: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      style={{ aspectRatio: aspect > 0 ? aspect : 16 / 9 }}
      className={cn(
        "group relative flex h-full shrink-0 items-center justify-center overflow-hidden border bg-[#0b0b0d]",
        active
          ? "border-primary ring-1 ring-primary"
          : "border-border hover:border-[#3a3a42]",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        title={title}
        className="absolute inset-0 flex items-center justify-center outline-none"
      >
        {src ? (
          <img
            src={src}
            alt={title}
            draggable={false}
            className="animate-fade-in pointer-events-none h-full w-full object-contain"
          />
        ) : (
          <Loader2 className="size-4 animate-spin text-muted-foreground/40" />
        )}
      </button>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        title={checked ? "Deselect" : "Select"}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={cn(
          "absolute top-1 left-1 z-10 flex size-5 cursor-pointer items-center justify-center border outline-none transition-opacity",
          checked
            ? "border-primary bg-primary text-primary-foreground opacity-100"
            : "border-white/60 bg-black/60 text-transparent opacity-0 group-hover/strip:opacity-100",
        )}
      >
        <Check className="size-3.5" strokeWidth={3} />
      </button>
      <span
        className={cn(
          "pointer-events-none absolute bottom-1 left-1 z-10 px-1 font-mono text-[9px] leading-none",
          active
            ? "bg-primary text-primary-foreground"
            : "bg-black/70 text-muted-foreground",
        )}
      >
        {label}
      </span>
      {canDelete && (
        <button
          type="button"
          title="Delete this comparison (re-roll a new one with +)"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute top-1 right-1 z-10 flex size-5 cursor-pointer items-center justify-center bg-black/70 text-white/80 opacity-0 outline-none transition-opacity group-hover:opacity-100 hover:bg-red-600 hover:text-white"
        >
          <Trash2 className="size-3" />
        </button>
      )}
    </div>
  );
}

function AddTile({ aspect, onClick }: { aspect: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Add a random comparison"
      style={{ aspectRatio: aspect > 0 ? aspect : 16 / 9 }}
      className="mr-3 flex h-full shrink-0 flex-col items-center justify-center gap-1 border border-dashed border-border bg-[#0b0b0d] text-muted-foreground outline-none transition-colors hover:border-primary/60 hover:text-foreground"
    >
      <Plus className="size-5" />
      <span className="text-xs font-medium">Add</span>
    </button>
  );
}
