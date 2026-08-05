export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex w-fit overflow-hidden rounded-md border border-border">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={
            "cursor-pointer px-3 py-1.5 text-xs transition-colors " +
            (value === v
              ? "bg-primary text-primary-foreground"
              : "bg-transparent text-muted-foreground hover:bg-muted/50")
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}
