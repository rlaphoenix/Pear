import { useRef } from "react";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  onDrag: (next: number) => void;
  onToggle: () => void;
  className?: string;
  title?: string;
}

export function ResizeHandle({
  value,
  onDrag,
  onToggle,
  className,
  title = "Drag to resize (click to toggle)",
}: Props) {
  const drag = useRef({ startY: 0, start: 0, active: false, moved: false });

  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    drag.current = { startY: e.clientY, start: value, active: true, moved: false };
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {}
  };
  const move = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    const dy = e.clientY - drag.current.startY;
    if (Math.abs(dy) > 3) drag.current.moved = true;
    onDrag(drag.current.start - dy);
  };
  const up = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    drag.current.active = false;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {}
    if (!drag.current.moved) onToggle();
  };

  return (
    <div
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      title={title}
      className={cn(
        "group absolute inset-x-0 -top-1 z-20 flex h-3 cursor-ns-resize touch-none items-center justify-center",
        className,
      )}
    >
      <div className="h-0.5 w-full bg-transparent transition-colors group-hover:bg-primary/60" />
    </div>
  );
}
