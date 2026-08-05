import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export function Tooltip({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const open = () => {
    if (ref.current) setRect(ref.current.getBoundingClientRect());
  };
  const close = () => setRect(null);

  return (
    <span
      ref={ref}
      className={cn("inline-flex", className)}
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
    >
      {children}
      {rect && <Bubble label={label} hint={hint} anchor={rect} />}
    </span>
  );
}

function Bubble({ label, hint, anchor }: { label: string; hint?: string; anchor: DOMRect }) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ left: 0, top: 0, opacity: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const m = 8;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const cx = anchor.left + anchor.width / 2;
    const left = Math.min(Math.max(m, cx - w / 2), window.innerWidth - w - m);
    const above = anchor.top - h - 6;
    const top = above >= m ? above : anchor.bottom + 6;
    setStyle({ left, top, opacity: 1 });
  }, [anchor]);

  return createPortal(
    <div
      ref={ref}
      style={{ position: "fixed", zIndex: 100, ...style }}
      className="pointer-events-none flex w-max max-w-[240px] flex-col gap-0.5 border border-border bg-popover px-2 py-1.5 text-left shadow-xl shadow-black/50"
    >
      <span className="text-[11px] font-semibold text-foreground">{label}</span>
      {hint && <span className="text-[10px] leading-snug text-muted-foreground">{hint}</span>}
    </div>,
    document.body,
  );
}
