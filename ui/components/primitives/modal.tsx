import { useEffect, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Modal({
  title,
  children,
  footer,
  onClose,
  className,
  bodyRef,
  headerActions,
}: {
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose?: () => void;
  className?: string;
  bodyRef?: Ref<HTMLDivElement>;
  headerActions?: ReactNode;
}) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-6"
      onMouseDown={onClose}
    >
      <div
        className={cn(
          "relative flex max-h-[85vh] w-full max-w-md flex-col border border-border bg-popover shadow-2xl shadow-black/60",
          className,
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title ? (
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
            <span>{title}</span>
            <div className="flex items-center gap-3">
              {headerActions}
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  title="Close"
                  className="flex cursor-pointer items-center text-white/80 outline-none transition-colors hover:text-white"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        ) : (
          onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close"
              className="absolute right-3 top-3 z-10 flex cursor-pointer items-center text-white/70 outline-none transition-colors hover:text-white"
            >
              <X className="size-4" />
            </button>
          )
        )}
        <div
          ref={bodyRef}
          className="min-h-0 flex-1 overflow-auto px-4 py-4 text-sm text-foreground/90"
        >
          {children}
        </div>
        {footer && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-border px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
