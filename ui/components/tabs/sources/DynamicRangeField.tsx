import { Sun } from "lucide-react";
import { NumberInput } from "@/components/primitives/number-input";
import { Select } from "@/components/primitives/select";
import { SubLabel } from "@/components/primitives/section";
import { CheckboxField, Checkbox } from "@/components/primitives/checkbox";
import {
  SRC_CSPS,
  TONEMAP_FUNCS,
  GAMUT_MAPPINGS,
  type TonemapSrc,
  type TonemapFunc,
  type GamutMapping,
} from "@/lib/tauri";
import { type UiSource } from "@/state/AppState";
import { useProject } from "@/state/AppState";

export function DynamicRangeField({ source }: { source: UiSource }) {
  const ctx = useProject();
  const id = source.id;
  const setTonemap = (on: boolean) => ctx.setTonemap(id, on);
  const setTonemapSrc = (src: TonemapSrc) => ctx.setTonemapSrc(id, src);
  const setTonemapFunc = (func: TonemapFunc) => ctx.setTonemapFunc(id, func);
  const setTonemapGamut = (gamut: GamutMapping) => ctx.setTonemapGamut(id, gamut);
  const setTonemapPeak = (peak: boolean) => ctx.setTonemapPeak(id, peak);
  const setTonemapDstNits = (nits: number | null) => ctx.setTonemapDstNits(id, nits);
  const setTonemapSrcNits = (nits: number | null) => ctx.setTonemapSrcNits(id, nits);
  const setTonemapUseDovi = (on: boolean) => ctx.setTonemapUseDovi(id, on);

  const detectedHdr = source.info?.hdr ?? "sdr";
  const tmOn = source.tonemap;
  // A legacy "auto" stored by older projects must be treated as unset, not as a source value.
  const stored = source.tonemapSrc as string;
  const resolvedSrc: TonemapSrc =
    stored && stored !== "auto" ? (stored as TonemapSrc) : (detectedHdr as TonemapSrc);
  const isDovi = resolvedSrc === "dovi";
  const dvProfile = source.info?.dvProfile ?? null;

  return (
    <div className="flex flex-col gap-2">
      <SubLabel icon={<Sun className="size-3" />}>
        Tonemapping (HDR / Dolby Vision)
      </SubLabel>
      <div className="flex items-center gap-2">
        <Checkbox checked={tmOn} onCheckedChange={(v) => setTonemap(v)} />
        <Select<TonemapSrc>
          value={resolvedSrc}
          options={SRC_CSPS}
          disabled={!tmOn}
          onValueChange={(v) => v && setTonemapSrc(v)}
          className="h-8 min-w-0 flex-1 px-2 text-xs"
        />
        <Select<TonemapFunc>
          value={source.tonemapFunc}
          options={TONEMAP_FUNCS}
          disabled={!tmOn}
          onValueChange={(v) => v && setTonemapFunc(v)}
          className="h-8 min-w-0 flex-1 px-2 text-xs"
        />
      </div>
      {tmOn && (
        <div className="flex flex-col gap-2 pl-[30px]">
          <div className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              Gamut mapping
            </span>
            <Select<GamutMapping>
              value={source.tonemapGamut}
              options={GAMUT_MAPPINGS}
              onValueChange={(v) => v && setTonemapGamut(v)}
              className="h-8 min-w-0 flex-1 px-2 text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                Target nits (0 = auto)
              </span>
              <NumberInput
                value={source.tonemapDstNits ?? 0}
                min={0}
                steppers={false}
                onValueChange={(v) => setTonemapDstNits(v > 0 ? v : null)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                Source nits (0 = auto)
              </span>
              <NumberInput
                value={source.tonemapSrcNits ?? 0}
                min={0}
                steppers={false}
                onValueChange={(v) => setTonemapSrcNits(v > 0 ? v : null)}
              />
            </div>
          </div>
          <CheckboxField
            checked={source.tonemapPeak}
            onCheckedChange={(v) => setTonemapPeak(v)}
            label="Dynamic peak detection"
          />
          {isDovi && (
            <CheckboxField
              checked={source.tonemapUseDovi}
              onCheckedChange={(v) => setTonemapUseDovi(v)}
              label="Apply Dolby Vision RPU"
            />
          )}
          {isDovi && (
            <p className="text-[10px] leading-relaxed text-muted-foreground/60">
              {dvProfile != null ? `Dolby Vision profile ${dvProfile} detected. ` : ""}
              RPU handling depends on the decoder passing it through: profile 8.1/8.4
              map best, profile 5 is best-effort, and profile 7 uses the base layer
              only (no enhancement layer).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
