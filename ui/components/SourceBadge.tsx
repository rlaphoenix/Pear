import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const SourceBadge = forwardRef<
  HTMLSpanElement,
  { index: number; className?: string }
>(function SourceBadge({ index, className }, ref) {
  const letter = String.fromCharCode(65 + Math.max(0, index));
  return (
    <span
      ref={ref}
      aria-label={`Source ${letter}`}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[0.25em] bg-white/10 align-middle text-current",
        className,
      )}
      style={{ width: "1.15em", height: "1.15em" }}
    >
      <span className="font-mono font-semibold leading-none" style={{ fontSize: "0.85em" }}>
        {letter}
      </span>
    </span>
  );
});
