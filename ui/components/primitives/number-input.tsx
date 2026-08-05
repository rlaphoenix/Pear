import { NumberField } from "@base-ui-components/react/number-field";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface NumberInputProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  id?: string;
  disabled?: boolean;
  steppers?: boolean;
  prefix?: string;
  postfix?: string;
  className?: string;
}

const STEP_BUTTON =
  "flex shrink-0 items-center justify-center text-muted-foreground outline-none hover:bg-accent hover:text-foreground disabled:opacity-40";

export function NumberInput({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  id,
  disabled,
  steppers = true,
  prefix,
  postfix,
  className,
}: NumberInputProps) {
  const affixed = prefix != null || postfix != null;
  return (
    <NumberField.Root
      id={id}
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      format={{ useGrouping: false }}
      onValueChange={(v) => onValueChange(v ?? 0)}
      className={cn("w-full", className)}
    >
      <NumberField.Group className="flex h-9 w-full items-stretch border border-input bg-[#0d0d10] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
        {steppers && (
          <NumberField.Decrement className={cn(STEP_BUTTON, "pl-2")}>
            <Minus className="size-3" />
          </NumberField.Decrement>
        )}
        <div className="flex flex-1 items-center justify-center gap-0.5 px-2 font-mono text-sm tabular-nums text-foreground">
          {prefix != null && <span className="text-muted-foreground">{prefix}</span>}
          <NumberField.Input
            className={cn(
              "min-w-0 bg-transparent text-center outline-none",
              affixed ? "[field-sizing:content] min-w-[1ch]" : "w-full",
            )}
          />
          {postfix != null && <span className="text-muted-foreground">{postfix}</span>}
        </div>
        {steppers && (
          <NumberField.Increment className={cn(STEP_BUTTON, "pr-2")}>
            <Plus className="size-3" />
          </NumberField.Increment>
        )}
      </NumberField.Group>
    </NumberField.Root>
  );
}
