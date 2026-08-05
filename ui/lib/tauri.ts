import { invoke } from "@tauri-apps/api/core";

export type DataUrl = string;
export type SourcePath = string;
export type SourceId = string;
export type SourceIndex = number;
export type ProjectFrame = number;
export type ComparisonIndex = number;
export type UnixSeconds = number;

// Resampling filters, named exactly as the `image` crate's `FilterType` variants.
export type Algo = "Nearest" | "Triangle" | "CatmullRom" | "Gaussian" | "Lanczos3";
export const ALGOS: Algo[] = [
  "Nearest",
  "Triangle",
  "CatmullRom",
  "Gaussian",
  "Lanczos3",
];

export type FrameMatch = "Any" | "I" | "P" | "B";
export const FRAME_MATCHES: FrameMatch[] = ["Any", "I", "P", "B"];


export type Matrix = "9" | "1" | "5" | "7" | "4";
export type MatrixSetting = Matrix | "";
export const MATRICES: { value: Matrix; label: string; description: string }[] = [
  { value: "9", label: "BT.2020", description: "UHD / HDR - 4K wide-gamut content" },
  { value: "1", label: "BT.709", description: "HD video - 720p/1080p and most modern content" },
  { value: "5", label: "BT.601", description: "SD 480i/576i - NTSC & PAL DVDs" },
  { value: "7", label: "SMPTE 240M", description: "Early HDTV (1035i); legacy, rarely needed" },
  { value: "4", label: "FCC", description: "Pre-1994 US analog NTSC; very rare" },
];

export type Range = "limited" | "full";
export type RangeSetting = Range | "";
export const RANGES: { value: Range; label: string; description: string }[] = [
  { value: "limited", label: "Limited (TV)", description: "Broadcast / studio levels (luma 16-235)" },
  { value: "full", label: "Full (PC)", description: "Full-range levels (luma 0-255)" },
];

export type HdrFormat = "sdr" | "hdr10" | "hdr10plus" | "hlg" | "dovi";
export const HDR_LABELS: Record<HdrFormat, string> = {
  sdr: "SDR",
  hdr10: "HDR10",
  hdr10plus: "HDR10+",
  hlg: "HLG",
  dovi: "Dolby Vision",
};

export type TonemapSrc = "sdr" | "hdr10" | "hdr10plus" | "hlg" | "dovi";
export const SRC_CSPS: { value: TonemapSrc; label: string; description: string }[] = [
  { value: "sdr", label: "SDR", description: "Standard dynamic range; tonemapping is a near no-op." },
  { value: "hlg", label: "HLG", description: "Hybrid Log-Gamma (broadcast HDR)." },
  { value: "hdr10", label: "HDR10", description: "PQ / BT.2020 static-metadata HDR (most 4K HDR)." },
  { value: "hdr10plus", label: "HDR10+", description: "HDR10 plus SMPTE 2094-40 dynamic metadata." },
  { value: "dovi", label: "Dolby Vision", description: "Apply the DV RPU; profile 8.1/8.4 map best." },
];

export type TonemapFunc =
  | "spline"
  | "bt2390"
  | "bt2446a"
  | "st2094-40"
  | "st2094-10"
  | "reinhard"
  | "mobius"
  | "hable"
  | "gamma"
  | "linear"
  | "clip";
export const TONEMAP_FUNCS: { value: TonemapFunc; label: string; description: string }[] = [
  { value: "spline", label: "Spline", description: "libplacebo default; balanced and high quality." },
  { value: "bt2390", label: "BT.2390 EETF", description: "ITU reference HDR to SDR curve." },
  { value: "bt2446a", label: "BT.2446 Method A", description: "ITU perceptual tone mapping." },
  { value: "st2094-40", label: "ST 2094-40", description: "Uses HDR10+ dynamic metadata when present." },
  { value: "st2094-10", label: "ST 2094-10", description: "Dolby dynamic tone mapping." },
  { value: "reinhard", label: "Reinhard", description: "Classic and simple; can look flat." },
  { value: "mobius", label: "Mobius", description: "Preserves mid-tones with a softer roll-off." },
  { value: "hable", label: "Hable (filmic)", description: "Filmic contrast; crushes darks slightly." },
  { value: "gamma", label: "Gamma", description: "Simple gamma-based mapping." },
  { value: "linear", label: "Linear", description: "Linear luminance scaling." },
  { value: "clip", label: "Clip", description: "Hard-clip highlights (no roll-off)." },
];

export type GamutMapping =
  | "perceptual"
  | "clip"
  | "softclip"
  | "relative"
  | "saturation"
  | "absolute"
  | "desaturate"
  | "darken"
  | "highlight"
  | "linear";
export const GAMUT_MAPPINGS: { value: GamutMapping; label: string; description: string }[] = [
  { value: "perceptual", label: "Perceptual", description: "Default; soft, perceptually even mapping." },
  { value: "clip", label: "Clip", description: "Hard-clip out-of-gamut colours." },
  { value: "softclip", label: "Soft clip", description: "Softer clip near the gamut boundary." },
  { value: "relative", label: "Relative", description: "Relative colorimetric." },
  { value: "saturation", label: "Saturation", description: "Preserve saturation." },
  { value: "absolute", label: "Absolute", description: "Absolute colorimetric." },
  { value: "desaturate", label: "Desaturate", description: "Desaturate to fit the gamut." },
  { value: "darken", label: "Darken", description: "Darken to preserve saturation." },
  { value: "highlight", label: "Highlight", description: "Flag out-of-gamut pixels (debug)." },
  { value: "linear", label: "Linear", description: "Linear gamut compression." },
];

export type HwDevice =
  | ""
  | "d3d11va"
  | "d3d12va"
  | "dxva2"
  | "cuda"
  | "qsv"
  | "vulkan"
  | "vaapi"
  | "videotoolbox";
export const HWDEVICES: { value: HwDevice; label: string; description: string; group: string }[] = [
  { value: "", label: "Software (CPU)", description: "Works on any system. The default.", group: "Universal" },
  {
    value: "vulkan",
    label: "Vulkan video",
    description: "Any GPU (NVIDIA/AMD/Intel) with recent drivers.",
    group: "Universal",
  },
  { value: "cuda", label: "NVIDIA CUDA", description: "NVIDIA GPUs.", group: "Universal" },
  {
    value: "qsv",
    label: "Intel Quick Sync (QSV)",
    description: "Intel integrated graphics and Arc GPUs.",
    group: "Universal",
  },
  {
    value: "d3d12va",
    label: "Direct3D 12",
    description: "Recent Windows GPUs and drivers.",
    group: "Windows",
  },
  {
    value: "d3d11va",
    label: "Direct3D 11",
    description: "Any modern Windows GPU (NVIDIA, AMD or Intel). The best GPU choice on Windows.",
    group: "Windows",
  },
  {
    value: "dxva2",
    label: "DXVA2 (legacy)",
    description: "Older Windows GPUs.",
    group: "Windows",
  },
  { value: "vaapi", label: "VA-API", description: "Intel and AMD GPUs on Linux.", group: "Linux" },
  {
    value: "videotoolbox",
    label: "VideoToolbox",
    description: "Apple Silicon and Intel Macs.",
    group: "macOS",
  },
];

export interface Crop {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export const ZERO_CROP: Crop = { top: 0, right: 0, bottom: 0, left: 0 };

export interface SourceInfo {
  fps: number;
  total: number;
  width: number;
  height: number;
  duration: number;
  sar: number;
  dar: string;
  matrix: Matrix;
  range: Range;
  isStill: boolean;
  transfer: string;
  primaries: string;
  hdr: HdrFormat;
  dvProfile: number | null;
  dvBlCompat: number | null;
}

export interface Segment {
  id: string;
  src: number;
  len: number;
  pos: number;
  name?: string;
}

export interface TonemapParams {
  on: boolean;
  src: TonemapSrc | "";
  func: TonemapFunc;
  gamut: GamutMapping;
  peak: boolean;
  dstNits: number | null;
  srcNits: number | null;
  useDovi: boolean;
}

interface SourceParams {
  path: string;
  crop: Crop;
  script: string;
  segments: Segment[];
  deinterlace: boolean;
  deintKernel: DeintKernel;
  deintDouble: boolean;
  dar: string;
  darAlgo: Algo;
  matrix: MatrixSetting;
  range: RangeSetting;
  name: string;
  tonemap: TonemapParams;
}

export type TabId = "sources" | "editor" | "preview" | "export";
export const TAB_IDS: TabId[] = ["sources", "editor", "preview", "export"];

export const DEFAULT_SCRIPT = `# \`clip\` is this source, already loaded - transform it below.
# \`SOURCE\` holds the file path if you need it.
#
# Example:
# clip = core.std.Crop(clip, top=20, right=0, bottom=20, left=0)
# clip = clip.resize.Spline36(1920, 1080)
`;

export interface GenParams {
  sources: SourceParams[];
  upscaleSmallest: boolean;
  upscaleAlgo: Algo;
  downscaleLargest: boolean;
  downscaleAlgo: Algo;
  cropToSmallest: boolean;
  padToLargest: boolean;
  marginStart: number;
  marginEnd: number;
  match: FrameMatch;
  infoBoxPosition: string;
  infoBoxScale: number;
  watermark?: boolean;
}

interface ImgMeta {
  filename: string;
  path: string;
  frameNum: number;
  total: number;
  frameType: string;
  origW: number;
  origH: number;
}

export interface SourceOut {
  src: string;
  w: number;
  h: number;
  meta: ImgMeta;
}

export interface Comparison {
  index: number;
  sources: SourceOut[];
  canvasW: number;
  canvasH: number;
}

export interface RenderReq {
  sources?: number[];
  position?: number | null;
  sourceFrame?: number | null;
  composite?: boolean;
  infoBox?: boolean;
  watermark?: boolean;
  maxW?: number | null;
  maxH?: number | null;
  raw?: boolean;
  cancelGroup?: string;
  cancelSeq?: number;
}

export interface RenderOut {
  frames: SourceOut[];
  canvasW: number;
  canvasH: number;
}


export interface SaveResult {
  dir: string;
  files: string[];
}

export type MatchKind = "i" | "p" | "b" | null;
export type DeintKernel = "bwdif" | "nnedi3" | "qtgmc" | "bob";
export const DEINT_KERNELS: DeintKernel[] = ["bwdif", "nnedi3", "qtgmc", "bob"];
export const deintKernelLabel = (a: string): string => (a === "bob" ? "Bob" : a.toUpperCase());

export interface DeinterlaceOpt {
  enabled: boolean;
  kernel: DeintKernel;
  double: boolean;
}
export interface TonemapOpt {
  enabled: boolean;
  src: TonemapSrc | "";
  func: TonemapFunc;
  gamut: GamutMapping;
  peak: boolean;
  dstNits: number | null;
  srcNits: number | null;
  useDovi: boolean;
}
interface ScaleOpt {
  enabled: boolean;
  algorithm: Algo;
}
interface MarginOpt {
  start: number;
  end: number;
}
export interface SavedSource {
  crop: Crop;
  segments: Segment[];
  size: number;
  id: string;
  deinterlace: DeinterlaceOpt;
  tonemap: TonemapOpt;
  dar: string;
  darAlgo: Algo;
  matrix: MatrixSetting;
  range: RangeSetting;
  name: string;
}

export interface ScriptTemplate {
  name: string;
  script: string;
}

export interface Config {
  upscale: ScaleOpt;
  downscale: ScaleOpt;
  cropToSmallest: boolean;
  padToLargest: boolean;
  comparisons: number[];
  gutterWidth: number;
  /** Key insertion order defines source order. */
  sources: Record<SourcePath, SavedSource>;
  name: string;
  thumbnail: string;
  created: UnixSeconds;
  modified: UnixSeconds;
  version: string;
}

export interface RecentProject {
  path: string;
  name: string;
  thumbnail: string;
}

export interface FileId {
  size: number;
  id: string;
}

export type ZoomMode = "fit" | "actual";
type FullscreenMode = "windowed" | "maximized" | "fullscreen";

export interface FullscreenIncludes {
  tabs: boolean;
  framestrip: boolean;
  seekbar: boolean;
  timeline: boolean;
  markup: boolean;
}

export type ZoomAlgo = "auto" | "smooth" | "crisp-edges" | "pixelated";

type PreviewBgMode = "checkerboard" | "static" | "gradient";

export interface PreviewBg {
  mode: PreviewBgMode;
  checkerColor1: string;
  checkerColor2: string;
  checkerOpacity: number;
  checkerSize: number;
  staticColor: string;
  gradientColor1: string;
  gradientColor2: string;
  gradientAngle: number;
}

export interface PreviewBorder {
  width: number;
  radius: number;
  color: string;
}

export const DEFAULT_PREVIEW_BG: PreviewBg = {
  mode: "checkerboard",
  checkerColor1: "#000000",
  checkerColor2: "#ffffff",
  checkerOpacity: 0.08,
  checkerSize: 11,
  staticColor: "#000000",
  gradientColor1: "#0a0a0d",
  gradientColor2: "#1a1a24",
  gradientAngle: 0,
};

export const DEFAULT_PREVIEW_BORDER: PreviewBorder = {
  width: 0,
  radius: 0,
  color: "#3a3a42",
};

export interface Prefs {
  recentProjects: string[];
  templates: ScriptTemplate[];
  defaultCount: number;
  minDistance: number;
  margin: MarginOpt;
  match: MatchKind;
  orderedComparisons: boolean;
  defaultZoom: ZoomMode;
  pixelPerfect: boolean;
  zoomAlgo: ZoomAlgo;
  fullscreenMode: FullscreenMode;
  fullscreenIncludes: FullscreenIncludes;
  infoBoxPosition: string;
  infoBoxScale: number;
  weaveFrames: number;
  watermark: boolean;
  previewBg: PreviewBg | null;
  previewBorder: PreviewBorder | null;
  hwdevice: string;
  hwfallback: boolean;
  lastTab: string;
  previewMode: string;
  seekBase: number;
  lastProject: string;
}

export interface AppSettings {
  defaultCount: number;
  minDistance: number;
  marginStart: number;
  marginEnd: number;
  match: FrameMatch;
  orderedComparisons: boolean;
  defaultZoom: ZoomMode;
  pixelPerfect: boolean;
  zoomAlgo: ZoomAlgo;
  fullscreenMode: FullscreenMode;
  fullscreenIncludes: FullscreenIncludes;
  infoBoxPosition: string;
  infoBoxScale: number;
  weaveFrames: number;
  watermark: boolean;
  previewBg: PreviewBg;
  previewBorder: PreviewBorder;
  hwdevice: HwDevice;
  hwfallback: boolean;
}

export interface ProbedSource {
  info: SourceInfo;
  dar: string;
  matrix: MatrixSetting;
  range: RangeSetting;
  tonemapSrc: TonemapSrc;
  tonemap: boolean;
}

export const initSource = (
  path: string,
  deinterlace = false,
  deintKernel: DeintKernel = "bwdif",
  deintDouble = false,
  dar = "",
  matrix: MatrixSetting = "",
  range: RangeSetting = "",
  tonemapSrc: TonemapSrc | "" = "",
  tonemap = false,
) =>
  invoke<ProbedSource>("init_source", {
    path,
    deinterlace,
    deintKernel,
    deintDouble,
    dar,
    matrix,
    range,
    tonemapSrc,
    tonemap,
  });

export interface IndexEvent {
  path: string;
  percent: number | null;
}

export const render = (params: GenParams, req: RenderReq) =>
  invoke<RenderOut>("render", { params, req });

export const frameBytes = (id: number) =>
  invoke<ArrayBuffer>("frame_bytes", { id });

export const releaseFrames = (ids: number[]) =>
  invoke<void>("release_frames", { ids });

export const pickPositions = (
  params: GenParams,
  count: number,
  minDistance: number,
  existing: number[],
) => invoke<number[]>("pick_positions", { params, count, minDistance, existing });

export const sourceKeyframes = (
  path: string,
  deinterlace = false,
  deintKernel: DeintKernel = "bwdif",
  deintDouble = false,
) => invoke<number[]>("source_keyframes", { path, deinterlace, deintKernel, deintDouble });

export interface Capabilities {
  deinterlacers: string[];
  keyframes: boolean;
}
export const capabilities = () => invoke<Capabilities>("capabilities");

export const saveAll = (
  params: GenParams,
  outDir: string | null,
  overlays: Record<ComparisonIndex, DataUrl>,
  positions: number[],
) => invoke<SaveResult>("save_all", { params, outDir, overlays, positions });

export const clearCache = () => invoke<void>("clear_cache");

export const discardIndexes = (paths: string[]) => invoke<void>("discard_indexes", { paths });

export const loadPrefs = () => invoke<Prefs>("load_prefs");

export const saveTemplates = (templates: ScriptTemplate[]) =>
  invoke<void>("save_templates", { templates });

const toMatchKind = (m: FrameMatch): MatchKind => (m === "Any" ? null : (m.toLowerCase() as MatchKind));

export const saveSettings = (s: AppSettings) =>
  invoke<void>("save_settings", {
    defaultCount: s.defaultCount,
    minDistance: s.minDistance,
    margin: { start: s.marginStart, end: s.marginEnd },
    frameMatch: toMatchKind(s.match),
    orderedComparisons: s.orderedComparisons,
    defaultZoom: s.defaultZoom,
    pixelPerfect: s.pixelPerfect,
    zoomAlgo: s.zoomAlgo,
    fullscreenMode: s.fullscreenMode,
    fullscreenIncludes: s.fullscreenIncludes,
    infoBoxPosition: s.infoBoxPosition,
    infoBoxScale: s.infoBoxScale,
    weaveFrames: s.weaveFrames,
    watermark: s.watermark,
    previewBg: s.previewBg,
    previewBorder: s.previewBorder,
    hwdevice: s.hwdevice,
    hwfallback: s.hwfallback,
  });

export const setHwdevice = (device: HwDevice) => invoke<void>("set_hwdevice", { device });

export const setHwfallback = (on: boolean) => invoke<void>("set_hwfallback", { on });

export const recentProjectsMeta = () =>
  invoke<RecentProject[]>("recent_projects_meta");

export const setUiState = (lastTab: string, previewMode: string, seekBase: number) =>
  invoke<void>("set_ui_state", { lastTab, previewMode, seekBase });

export const setLastProject = (path: string) =>
  invoke<void>("set_last_project", { path });

export const openUrl = (url: string) => invoke<void>("open_url", { url });

export const openVapoursynthFolder = () => invoke<void>("open_vapoursynth_folder");

export interface BuildInfo {
  app: string;
  vapoursynth: string;
  bestsource: string;
}
export const buildInfo = () => invoke<BuildInfo>("build_info");

export interface VsStatus {
  ready: boolean;
  state: string;
  version: string;
  api: string;
  threads: number;
  cacheUsed: number;
  cacheMax: number;
  memUsed: number;
  memMax: number;
  coreAlive: boolean;
  active: number;
  decoder: string;
  hwdevice: string;
}
export const vsStatus = () => invoke<VsStatus>("vs_status");

export const takePendingProject = () => invoke<string | null>("take_pending_project");

export const markRecent = (path: string) => invoke<void>("mark_recent", { path });

export const removeRecent = (path: string) =>
  invoke<void>("remove_recent", { path });

export const loadProject = (path: string) =>
  invoke<Config>("load_project", { path });

export const saveProject = (path: string, project: Config) =>
  invoke<void>("save_project", { path, project });

export const lockProject = (path: string) =>
  invoke<void>("lock_project", { path });

export const unlockProject = () => invoke<void>("unlock_project");

export const toggleDevtools = () => invoke<void>("toggle_devtools");

export const fileExists = (path: string) =>
  invoke<boolean>("file_exists", { path });

export const fileId = (path: string) => invoke<FileId>("file_id", { path });
