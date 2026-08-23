import { useMemo } from "react";
import { DEFAULT_SCRIPT, type AppSettings, type GenParams } from "@/lib/tauri";
import type { Settings } from "@/state/AppState";

export function useGenParams(
  settings: Settings,
  scripts: Record<string, string>,
  appSettings: AppSettings,
): { params: GenParams; frameKey: string } {
  const sources = settings.sources;

  const params: GenParams = useMemo(
    () => ({
      sources: sources.reduce<GenParams["sources"]>((acc, s) => {
        if (s.path)
          acc.push({
            path: s.path ?? "",
            crop: s.crop,
            script: scripts[s.id] ?? DEFAULT_SCRIPT,
            segments: s.segments,
            deinterlace: s.deinterlace,
            deintKernel: s.deintKernel,
            deintDouble: s.deintDouble,
            dar: s.dar,
            darAlgo: s.darAlgo,
            matrix: s.matrix,
            range: s.range,
            tonemap: {
              on: s.tonemap,
              src: s.tonemapSrc,
              func: s.tonemapFunc,
              gamut: s.tonemapGamut,
              peak: s.tonemapPeak,
              dstNits: s.tonemapDstNits,
              srcNits: s.tonemapSrcNits,
              useDovi: s.tonemapUseDovi,
            },
            name: s.name,
            tempoMode: s.tempoMode,
            tempoDecimator: s.tempoDecimator,
            tempoFps: s.tempoFps,
          });
        return acc;
      }, []),
      upscaleSmallest: settings.upscaleSmallest,
      upscaleAlgo: settings.upscaleAlgo,
      downscaleLargest: settings.downscaleLargest,
      downscaleAlgo: settings.downscaleAlgo,
      cropToSmallest: settings.cropToSmallest,
      padToLargest: settings.padToLargest,
      marginStart: appSettings.marginStart,
      marginEnd: appSettings.marginEnd,
      match: appSettings.match,
      infoBoxPosition: appSettings.infoBoxPosition,
      infoBoxScale: appSettings.infoBoxScale,
      watermark: appSettings.watermark,
    }),
    [
      settings,
      sources,
      scripts,
      appSettings.marginStart,
      appSettings.marginEnd,
      appSettings.match,
      appSettings.infoBoxPosition,
      appSettings.infoBoxScale,
      appSettings.watermark,
    ],
  );

  const frameKey = JSON.stringify(params);

  return { params, frameKey };
}
