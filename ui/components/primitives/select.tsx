import { Select as BaseSelect } from "@base-ui-components/react/select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SelectOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  group?: string;
}

interface SelectProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: SelectOption<T>[];
  className?: string;
  disabled?: boolean;
}

function renderItem<T extends string>(opt: SelectOption<T>) {
  return (
    <BaseSelect.Item
      key={opt.value}
      value={opt.value}
      className={cn(
        "flex cursor-default select-none items-center justify-between gap-3 px-3 py-1.5 text-sm outline-none",
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
      )}
    >
      <span className="flex min-w-0 flex-col">
        <BaseSelect.ItemText>{opt.label}</BaseSelect.ItemText>
        {opt.description && (
          <span className="text-[11px] leading-tight text-muted-foreground">{opt.description}</span>
        )}
      </span>
      <BaseSelect.ItemIndicator className="shrink-0 text-primary">
        <Check className="size-4" />
      </BaseSelect.ItemIndicator>
    </BaseSelect.Item>
  );
}

export function Select<T extends string>({
  value,
  onValueChange,
  options,
  className,
  disabled,
}: SelectProps<T>) {
  const sections: { group?: string; items: SelectOption<T>[] }[] = [];
  for (const opt of options) {
    const last = sections[sections.length - 1];
    if (last && last.group === opt.group) last.items.push(opt);
    else sections.push({ group: opt.group, items: [opt] });
  }

  return (
    <BaseSelect.Root
      value={value}
      disabled={disabled}
      onValueChange={(v) => onValueChange(v as T)}
      items={options}
    >
      <BaseSelect.Trigger
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 border border-input bg-[#0d0d10] px-3 text-sm outline-none",
          "hover:bg-accent focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
          "disabled:opacity-40 data-[popup-open]:border-ring",
          className,
        )}
      >
        <BaseSelect.Value className="min-w-0 flex-1 truncate text-left" />
        <BaseSelect.Icon className="shrink-0 text-muted-foreground">
          <ChevronDown className="size-4" />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner className="z-[200] outline-none" sideOffset={6}>
          <BaseSelect.Popup className="max-h-72 min-w-[var(--anchor-width)] overflow-auto border border-border bg-popover p-1 text-popover-foreground shadow-xl shadow-black/40 origin-[var(--transform-origin)] transition-[transform,opacity] data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0">
            {sections.map((sec) =>
              sec.group ? (
                <BaseSelect.Group key={sec.group}>
                  <BaseSelect.GroupLabel className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {sec.group}
                  </BaseSelect.GroupLabel>
                  {sec.items.map(renderItem)}
                </BaseSelect.Group>
              ) : (
                sec.items.map(renderItem)
              ),
            )}
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
