import { GripVertical } from "lucide-react";

interface ScrollbarProps {
  gutterW: number;
  viewW: number;
  thumbLeft: number;
  thumbW: number;
  startBarDrag: (e: React.PointerEvent, mode: "pan" | "left" | "right") => void;
}

export function TimelineScrollbar({
  gutterW,
  viewW,
  thumbLeft,
  thumbW,
  startBarDrag,
}: ScrollbarProps) {
  return (
    <div className="flex">
      <div className="shrink-0 border-r border-border" style={{ width: gutterW }} />
      <div className="relative min-w-0 flex-1 select-none">
        <div className="relative h-4 bg-[#0e0e12]">
          {viewW > 0 && (
            <div
              className="absolute top-0 flex h-full cursor-grab items-center justify-between bg-primary/20 transition-colors hover:bg-primary/30"
              style={{ left: thumbLeft, width: thumbW }}
              onPointerDown={(e) => startBarDrag(e, "pan")}
              title="Drag to scroll · drag the ends to zoom"
            >
              <span
                className="flex h-full cursor-ew-resize items-center text-primary/70 transition-colors hover:text-primary"
                onPointerDown={(e) => startBarDrag(e, "left")}
                title="Drag to zoom"
              >
                <GripVertical className="size-3.5" />
              </span>
              <span
                className="flex h-full cursor-ew-resize items-center text-primary/70 transition-colors hover:text-primary"
                onPointerDown={(e) => startBarDrag(e, "right")}
                title="Drag to zoom"
              >
                <GripVertical className="size-3.5" />
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
