import { Checkbox } from "@/components/primitives/checkbox";
import { NumberInput } from "@/components/primitives/number-input";
import { Segmented } from "@/components/settings/Segmented";
import { type ExpirationType } from "@/lib/tauri";
import { cn } from "@/lib/utils";

const EXPIRATION_TYPES = [
  ["from_last_access", "From last view"],
  ["from_creation", "From creation"],
] as const satisfies readonly (readonly [ExpirationType, string])[];

const daysPostfix = (days: number) => ` day${days === 1 ? "" : "s"}`;

export function Expiration({
  enabled,
  onEnabledChange,
  days,
  onDaysChange,
  type,
  onTypeChange,
}: {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  days: number;
  onDaysChange: (days: number) => void;
  type: ExpirationType;
  onTypeChange: (type: ExpirationType) => void;
}) {
  return (
    <>
      <div className="flex items-center gap-3">
        <Checkbox checked={enabled} onCheckedChange={onEnabledChange} />
        <div className="w-40">
          <NumberInput
            value={days}
            onValueChange={(v) => onDaysChange(Math.max(1, Math.round(v)))}
            min={1}
            disabled={!enabled}
            postfix={daysPostfix(days)}
          />
        </div>
        <div className={cn(!enabled && "pointer-events-none opacity-50")}>
          <Segmented<ExpirationType> value={type} options={EXPIRATION_TYPES} onChange={onTypeChange} />
        </div>
      </div>
      <span className="text-xs text-muted-foreground/70">
        When checked, the shared upload will expire in that many days from upload.
      </span>
    </>
  );
}
