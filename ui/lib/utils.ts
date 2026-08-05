import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { frameBytes, type SourceOut } from "@/lib/tauri";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function splitSourceError(error: string): { source: string | null; detail: string } {
  const nl = error.indexOf("\n");
  return nl >= 0
    ? { source: error.slice(0, nl).trim(), detail: error.slice(nl + 1) }
    : { source: null, detail: error };
}

export const MEDIA_EXTS = [
  "mkv", "mp4", "m4v", "mov", "avi", "webm", "ts", "m2ts", "mts", "wmv", "flv",
  "mpg", "mpeg", "vob", "y4m",
  "png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff", "gif",
];

export function rawFrameIds(frames: SourceOut[]): number[] {
  const ids: number[] = [];
  for (const f of frames) {
    if (f.src.startsWith("frame:")) ids.push(Number(f.src.slice("frame:".length)));
  }
  return ids;
}

const inflightBytes = new Map<number, Promise<ArrayBuffer>>();

function frameBytesOnce(id: number): Promise<ArrayBuffer> {
  const existing = inflightBytes.get(id);
  if (existing) return existing;
  const p = frameBytes(id);
  inflightBytes.set(id, p);
  void p.finally(() => {
    if (inflightBytes.get(id) === p) inflightBytes.delete(id);
  });
  return p;
}

export async function decodeFrame(frame: SourceOut): Promise<ImageBitmap> {
  if (frame.src.startsWith("frame:")) {
    const id = Number(frame.src.slice("frame:".length));
    const buf = await frameBytesOnce(id);
    const data = new ImageData(new Uint8ClampedArray(buf), frame.w, frame.h);
    return createImageBitmap(data);
  }
  const img = new Image();
  img.src = frame.src;
  await img.decode();
  return createImageBitmap(img);
}

export async function frameToCanvas(frame: SourceOut): Promise<HTMLCanvasElement> {
  const bmp = await decodeFrame(frame);
  const canvas = document.createElement("canvas");
  canvas.width = frame.w;
  canvas.height = frame.h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0);
  bmp.close();
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png"): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), type),
  );
}

export async function frameToBlob(frame: SourceOut): Promise<Blob> {
  return canvasToBlob(await frameToCanvas(frame));
}
