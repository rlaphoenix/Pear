import type { ReactNode } from "react";
import { Checkbox as BaseCheckbox } from "@base-ui-components/react/checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
}

export function Checkbox({
  checked,
  onCheckedChange,
  id,
  className,
  disabled,
}: CheckboxProps) {
  return (
    <BaseCheckbox.Root
      id={id}
      checked={checked}
      disabled={disabled}
      onCheckedChange={(v) => onCheckedChange(v)}
      className={cn(
        "flex size-[18px] shrink-0 items-center justify-center border border-input bg-[#0d0d10] outline-none",
        "data-[checked]:border-primary data-[checked]:bg-primary",
        "focus-visible:ring-2 focus-visible:ring-ring/50",
        "disabled:opacity-40",
        className,
      )}
    >
      <BaseCheckbox.Indicator className="flex text-primary-foreground data-[unchecked]:hidden">
        <Check className="size-3.5" strokeWidth={3} />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}

export function CheckboxField({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex w-fit max-w-xl gap-3 select-none",
        description ? "items-start" : "items-center",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        className,
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={description ? "mt-0.5" : undefined}
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm text-foreground/90">{label}</span>
        {description && <span className="text-xs text-muted-foreground">{description}</span>}
      </span>
    </label>
  );
}
