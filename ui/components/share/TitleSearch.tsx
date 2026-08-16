import { useRef, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { Check, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { searchTitles, type TmdbTitle } from "@/lib/tauri";

const titleLabel = (t: TmdbTitle) => (t.year ? `${t.name} (${t.year})` : t.name);

interface Props {
  value: TmdbTitle | null;
  onChange: (value: TmdbTitle | null) => void;
  placeholder?: string;
}

export function TitleSearch({ value, onChange, placeholder }: Props) {
  const [items, setItems] = useState<TmdbTitle[]>([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const runSearch = (raw: string) => {
    clearTimeout(timer.current);
    const query = raw.trim();
    if (query.length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      const id = ++seq.current;
      try {
        const hits = await searchTitles(query);
        if (id === seq.current) setItems(hits);
      } catch {
        if (id === seq.current) setItems([]);
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 250);
  };

  return (
    <Combobox.Root
      items={items}
      value={value}
      onValueChange={(v) => onChange(v)}
      filter={null}
      itemToStringLabel={titleLabel}
      isItemEqualToValue={(a, b) => a.mediaType === b.mediaType && a.id === b.id}
      onInputValueChange={(text) => runSearch(text)}
    >
      <div className="relative">
        <Combobox.Input
          placeholder={placeholder}
          className={cn(
            "flex h-9 w-full border border-input bg-[#0d0d10] pl-3 pr-9 py-1 text-sm text-foreground",
            "placeholder:text-muted-foreground/60 outline-none",
            "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
          )}
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : value ? (
            <Combobox.Clear
              className="pointer-events-auto flex cursor-pointer outline-none hover:text-foreground"
              aria-label="Clear title"
            >
              <X className="size-4" />
            </Combobox.Clear>
          ) : (
            <Search className="size-4" />
          )}
        </span>
      </div>
      <Combobox.Portal>
        <Combobox.Positioner className="z-[200] outline-none" sideOffset={6}>
          <Combobox.Popup className="max-h-72 min-w-[var(--anchor-width)] overflow-auto border border-border bg-popover p-1 text-popover-foreground shadow-xl shadow-black/40">
            <Combobox.Empty>
              <div className="px-3 py-2 text-xs text-muted-foreground">
                {loading ? "Searching…" : "No titles found"}
              </div>
            </Combobox.Empty>
            <Combobox.List>
              {(item: TmdbTitle) => (
                <Combobox.Item
                  key={`${item.mediaType}-${item.id}`}
                  value={item}
                  className={cn(
                    "flex cursor-default select-none items-center justify-between gap-3 px-3 py-1.5 text-sm outline-none",
                    "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                  )}
                >
                  <span className="min-w-0 truncate">
                    {item.name}
                    {item.year != null && (
                      <span className="text-muted-foreground"> ({item.year})</span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      {item.mediaType === "tv" ? "TV" : "Movie"}
                    </span>
                    <Combobox.ItemIndicator className="text-primary">
                      <Check className="size-4" />
                    </Combobox.ItemIndicator>
                  </span>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
