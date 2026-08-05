import type { CSSProperties } from "react";
import type { PreviewBg, PreviewBorder, ZoomAlgo } from "@/lib/tauri";

export type PreviewMode = "single" | "split" | "juxtapose" | "weave";

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
