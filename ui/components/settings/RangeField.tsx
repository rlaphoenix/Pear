export function RangeField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex w-fit items-center gap-3 text-xs text-foreground/85">
      {label && <span className="w-24 shrink-0">{label}</span>}
      <span className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-36 cursor-pointer accent-primary"
        />
        <span className="w-12 text-right font-mono tabular-nums text-muted-foreground">
          {value}
          {suffix}
        </span>
      </span>
    </label>
  );
}
