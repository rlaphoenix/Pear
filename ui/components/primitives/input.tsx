import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    data-slot="input"
    className={cn(
      "flex h-9 w-full border border-input bg-[#0d0d10] px-3 py-1 text-sm text-foreground",
      "placeholder:text-muted-foreground/60 outline-none",
      "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "font-mono tabular-nums",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
