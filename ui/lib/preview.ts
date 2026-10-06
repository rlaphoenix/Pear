import type { CSSProperties } from "react";
import type { PreviewBg, PreviewBorder, ZoomAlgo } from "@/lib/tauri";

export type PreviewMode = "single" | "split" | "juxtapose" | "weave";

// Visual-only display controls, modelled on slow.pics. They change how the composited frame is
// shown in the preview - never the actual image data.
// - CanvasMode sets the base fit the viewport resets to (wheel-zoom/pan still layer on top).
// - FillMode maps to CSS object-fit, ImagePosition to CSS object-position (its values are valid
//   object-position keywords as-is).
export const canvasModeOptions = [
  { value: "fit", label: "Fit" },
  { value: "none", label: "Native size" },
  { value: "fit-width", label: "Fill width" },
  { value: "fit-height", label: "Fill height" },
] as const;
export type CanvasMode = (typeof canvasModeOptions)[number]["value"];

export const fillModeOptions = [
  { value: "none", label: "As is" },
  { value: "contain", label: "Contain" },
  { value: "cover", label: "Cover" },
  { value: "fill", label: "Stretch" },
] as const;
export type FillMode = (typeof fillModeOptions)[number]["value"];

export const imagePositionOptions = [
  { value: "center", label: "Center" },
  { value: "top left", label: "Top left" },
  { value: "top", label: "Top" },
  { value: "top right", label: "Top right" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "bottom left", label: "Bottom left" },
  { value: "bottom", label: "Bottom" },
  { value: "bottom right", label: "Bottom right" },
] as const;
export type ImagePosition = (typeof imagePositionOptions)[number]["value"];

// Spatial scaling: which source (if any) every source is scaled toward, and how the resolution is
// chosen. Backed by the upscaleSmallest/downscaleLargest booleans + scaleMode project settings.
export const scaleOptions = [
  { value: "none", label: "No scaling" },
  { value: "upscale", label: "Upscale smallest" },
  { value: "downscale", label: "Downscale largest" },
] as const;
export type ScaleChoice = (typeof scaleOptions)[number]["value"];

export const scaleModeOptions = [
  { value: "both", label: "Fit both dimensions" },
  { value: "height", label: "Match by height" },
  { value: "width", label: "Match by width" },
] as const;

export function zoomCss(algo: ZoomAlgo): CSSProperties["imageRendering"] {
  switch (algo) {
    case "pixelated":
      return "pixelated";
    case "crisp-edges":
      return "crisp-edges";
    case "smooth":
      return "smooth";
    default:
      return "auto";
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = h.length === 3
    ? h.split("").map((c) => c + c).join("")
    : h.padEnd(6, "0").slice(0, 6);
  const v = parseInt(n, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function dim(hex: string, opacity: number): string {
  const [r, g, b] = hexToRgb(hex);
  const k = Math.max(0, Math.min(1, opacity));
  return `rgb(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)})`;
}

export function previewBgStyle(bg: PreviewBg): CSSProperties {
  if (bg.mode === "static") {
    return { backgroundColor: bg.staticColor };
  }
  if (bg.mode === "gradient") {
    const g = `linear-gradient(${bg.gradientAngle}deg, ${bg.gradientColor1}, ${bg.gradientColor2})`;
    return { backgroundImage: g };
  }
  const a = dim(bg.checkerColor1, bg.checkerOpacity);
  const b = dim(bg.checkerColor2, bg.checkerOpacity);
  const sq = Math.max(1, bg.checkerSize || 11);
  const pat = sq * 2;
  return {
    backgroundColor: b,
    backgroundImage: `linear-gradient(45deg, ${a} 25%, transparent 25%),
      linear-gradient(-45deg, ${a} 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, ${a} 75%),
      linear-gradient(-45deg, transparent 75%, ${a} 75%)`,
    backgroundSize: `${pat}px ${pat}px`,
    backgroundPosition: `0 0, 0 ${sq}px, ${sq}px -${sq}px, -${sq}px 0px`,
  };
}

export function previewBorderStyle(b: PreviewBorder, scale: number): CSSProperties {
  if (!b.width) return { borderRadius: b.radius ? b.radius / Math.max(scale, 0.0001) : 0 };
  const s = Math.max(scale, 0.0001);
  return {
    border: `${b.width / s}px solid ${b.color}`,
    borderRadius: b.radius ? b.radius / s : 0,
  };
}
