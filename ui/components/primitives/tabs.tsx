import * as React from "react";
import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export function TopTabs({
  tabs,
  value,
  onChange,
  left,
  right,
  rightTabs,
  rightFlush,
}: {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  left?: React.ReactNode;
  right?: React.ReactNode;
  rightTabs?: TabItem[];
  rightFlush?: React.ReactNode;
}) {
  const renderTab = (t: TabItem) => {
    const active = t.id === value;
    return (
      <button
        key={t.id}
        onClick={() => !t.disabled && onChange(t.id)}
        disabled={t.disabled}
        className={cn(
          "relative flex items-center gap-2 px-5 text-sm font-medium outline-none transition-colors",
          t.disabled
            ? "cursor-not-allowed text-muted-foreground/25"
            : active
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground/80",
        )}
      >
        {t.icon}
        {t.label}
        <span
          className={cn(
            "absolute inset-x-0 bottom-0 h-0.5 transition-all duration-200 ease-[var(--ease-smooth)]",
            active && !t.disabled ? "bg-primary" : "bg-transparent",
          )}
        />
      </button>
    );
  };

  return (
    <div
      data-tauri-drag-region=""
      className="flex h-11 shrink-0 items-stretch border-b border-border bg-[#0b0b0e]"
    >
      {left}
      {tabs.map(renderTab)}
      <div data-tauri-drag-region="" className="ml-auto flex items-center gap-3 px-4">
        {right}
      </div>
      {rightTabs?.map(renderTab)}
      {rightFlush}
    </div>
  );
}
