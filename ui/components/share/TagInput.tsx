import { useEffect, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { Check, X } from "lucide-react";
import { listTags, type TagOption } from "@/lib/tauri";

interface Props {
  value: TagOption[];
  onChange: (value: TagOption[]) => void;
  placeholder?: string;
}

export function TagInput({ value, onChange, placeholder }: Props) {
  const [items, setItems] = useState<TagOption[]>([]);

  useEffect(() => {
    let alive = true;
    listTags()
      .then((tags) => {
        console.log("[tags] listTags ->", tags.length, tags);
        if (alive) setItems(tags);
      })
      .catch((e) => console.error("[tags] listTags failed", e));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Combobox.Root
      multiple
      items={items}
      value={value}
      onValueChange={(v) => onChange(v)}
      filter={(item, query) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return (
          item.label.toLowerCase().includes(q) ||
          (item.synonyms ?? []).some((s) => s.toLowerCase().includes(q))
        );
      }}
      itemToStringLabel={(t) => t.label}
      isItemEqualToValue={(a, b) => a.value === b.value}
    >
      <Combobox.Chips className="flex min-h-9 w-full flex-wrap items-center gap-1.5 border border-input bg-[#0d0d10] px-2 py-1.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
        {value.map((tag) => (
          <Combobox.Chip
            key={tag.value}
            className="flex items-center gap-1 rounded bg-accent py-0.5 pl-2 pr-1 text-xs text-accent-foreground"
          >
            {tag.label}
            <Combobox.ChipRemove
              aria-label={`Remove ${tag.label}`}
              className="flex cursor-pointer text-muted-foreground outline-none hover:text-foreground"
            >
              <X className="size-3" />
            </Combobox.ChipRemove>
          </Combobox.Chip>
        ))}
        <Combobox.Input
          placeholder={value.length === 0 ? placeholder : undefined}
          className="h-6 min-w-[6rem] flex-1 bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
        />
      </Combobox.Chips>
      <Combobox.Portal>
        <Combobox.Positioner className="z-[200] outline-none" sideOffset={6}>
          <Combobox.Popup className="max-h-64 min-w-[var(--anchor-width)] overflow-auto border border-border bg-popover p-1 text-popover-foreground shadow-xl shadow-black/40">
            <Combobox.Empty>
              <div className="px-3 py-2 text-xs text-muted-foreground">No tags found</div>
            </Combobox.Empty>
            <Combobox.List>
              {(item: TagOption) => (
                <Combobox.Item
                  key={item.value}
                  value={item}
                  className="flex cursor-default select-none items-center justify-between gap-3 px-3 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                >
                  <span className="min-w-0 truncate">{item.label}</span>
                  <Combobox.ItemIndicator className="text-primary">
                    <Check className="size-4" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
