import * as React from "react";
import { cn } from "@/lib/utils";

export function GroupLabel({
  children,
  right,
  className,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between", className)}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {children}
      </span>
      {right}
    </div>
  );
}

export function SubLabel({
  icon,
  children,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
      {icon}
      {children}
    </div>
  );
}
