import { cn } from "@/lib/utils";

const INFO_ROWS = ["top", "middle", "bottom"] as const;
const INFO_COLS = ["left", "center", "right"] as const;

export function InfoPositionGrid({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid w-fit grid-cols-3 gap-1.5">
      {INFO_ROWS.map((v) =>
        INFO_COLS.map((h) => {
          const pos = `${v}-${h}`;
          const sel = value === pos;
          return (
            <button
              key={pos}
              type="button"
              onClick={() => onChange(pos)}
              title={`${v} ${h}`}
              className={cn(
                "flex h-10 w-14 cursor-pointer flex-col gap-1 rounded-sm border p-1.5 transition-colors",
                v === "top" ? "justify-start" : v === "middle" ? "justify-center" : "justify-end",
                h === "left" ? "items-start" : h === "center" ? "items-center" : "items-end",
                sel ? "border-primary bg-primary/15" : "border-border hover:bg-muted/40",
              )}
            >
              <span className={cn("h-0.5 w-6 rounded-full", sel ? "bg-primary" : "bg-muted-foreground/40")} />
              <span className={cn("h-0.5 w-3.5 rounded-full", sel ? "bg-primary" : "bg-muted-foreground/40")} />
            </button>
          );
        }),
      )}
    </div>
  );
}
