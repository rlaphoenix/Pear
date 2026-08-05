import { Select as BaseSelect } from "@base-ui-components/react/select";
import { Check, ChevronDown, Columns2, Layers, Square, SquareSplitHorizontal } from "lucide-react";
import type { PreviewMode } from "@/lib/preview";

const MODES: { value: PreviewMode; icon: typeof Square; label: string; title: string }[] = [
  { value: "single", icon: Square, label: "Single", title: "One source, click to cycle" },
  { value: "split", icon: Columns2, label: "Split", title: "Every source in equal bands" },
  {
    value: "juxtapose",
    icon: SquareSplitHorizontal,
    label: "Juxtapose",
    title: "Two sources with a slider",
  },
  {
    value: "weave",
    icon: Layers,
    label: "Weave",
    title: "Cycle sources by frame number (set the interval in Settings)",
  },
];

export function PreviewModeToggle({
  mode,
  setMode,
}: {
  mode: PreviewMode;
  setMode: (m: PreviewMode) => void;
}) {
  return (
    <BaseSelect.Root
      value={mode}
      onValueChange={(v) => setMode(v as PreviewMode)}
      items={MODES.map((m) => ({ value: m.value, label: m.label }))}
    >
      <BaseSelect.Trigger
        title="Comparison layout"
        className="flex h-full items-center gap-1.5 border-l border-border px-3 text-xs text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground data-[popup-open]:bg-accent data-[popup-open]:text-foreground"
      >
        <BaseSelect.Value>
          {(value) => {
            const m = MODES.find((x) => x.value === value) ?? MODES[0];
            const Icon = m.icon;
            return (
              <span className="flex items-center gap-1.5">
                <Icon className="size-3.5" />
                {m.label}
              </span>
            );
          }}
        </BaseSelect.Value>
        <BaseSelect.Icon className="text-muted-foreground">
          <ChevronDown className="size-3.5" />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner className="z-[200] outline-none" sideOffset={6} alignItemWithTrigger={false}>
          <BaseSelect.Popup className="min-w-[var(--anchor-width)] border border-border bg-popover p-1 text-popover-foreground shadow-xl shadow-black/40 origin-[var(--transform-origin)] transition-[transform,opacity] data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0">
            {MODES.map(({ value, icon: Icon, label, title }) => (
              <BaseSelect.Item
                key={value}
                value={value}
                title={title}
                className="flex cursor-default select-none items-center justify-between gap-3 px-3 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
              >
                <span className="flex items-center gap-2">
                  <Icon className="size-4" />
                  <BaseSelect.ItemText>{label}</BaseSelect.ItemText>
                </span>
                <BaseSelect.ItemIndicator className="shrink-0 text-primary">
                  <Check className="size-4" />
                </BaseSelect.ItemIndicator>
              </BaseSelect.Item>
            ))}
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
