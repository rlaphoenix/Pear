import { Layers } from "lucide-react";
import { Select } from "@/components/primitives/select";
import { SubLabel } from "@/components/primitives/section";
import { Checkbox } from "@/components/primitives/checkbox";
import { type DeintKernel } from "@/lib/tauri";
import { type UiSource } from "@/state/AppState";
import { useProject } from "@/state/AppState";

const rateOptions = [
  { value: "single", label: "Single Rate" },
  { value: "double", label: "Double Rate" },
];

export function DeinterlacerField({
  source,
  deintKernelOptions,
}: {
  source: UiSource;
  deintKernelOptions: { value: DeintKernel; label: string }[];
}) {
  const ctx = useProject();
  const id = source.id;
  const setDeinterlace = (on: boolean) => ctx.setDeinterlace(id, on);
  const setDeintKernel = (algo: DeintKernel) => ctx.setDeintKernel(id, algo);
  const setDeintDouble = (double: boolean) => ctx.setDeintDouble(id, double);
  const isStill = !!source.info?.isStill;

  return (
    <div className="flex flex-col gap-2">
      <SubLabel icon={<Layers className="size-3" />}>
        Deinterlace{isStill && " (n/a for stills)"}
      </SubLabel>
      <div className="flex items-center gap-2">
        <Checkbox
          checked={source.deinterlace}
          disabled={isStill}
          onCheckedChange={(v) => setDeinterlace(v)}
        />
        <Select<DeintKernel>
          value={source.deintKernel}
          options={deintKernelOptions}
          disabled={isStill || !source.deinterlace}
          onValueChange={(v) => setDeintKernel(v)}
          className="h-8 min-w-0 flex-1 px-2 text-xs"
        />
        <Select<string>
          value={source.deintDouble ? "double" : "single"}
          options={rateOptions}
          disabled={isStill || !source.deinterlace}
          onValueChange={(v) => setDeintDouble(v === "double")}
          className="h-8 min-w-0 flex-1 px-2 text-xs"
        />
      </div>
    </div>
  );
}
