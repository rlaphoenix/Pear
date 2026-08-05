import { useEffect, useRef, useState } from "react";
import {
  Annotation,
  MarkupTool,
  Point,
  renderMarkup,
  Shape,
} from "@/lib/markup";

interface Props {
  annotations: Annotation[];
  tool: MarkupTool | null;
  color: string;
  size: number;
  width: number;
  height: number;
  onAdd: (ann: Annotation) => void;
}

const FREEHAND = new Set<Shape>(["pen", "highlighter", "eraser"]);

const shapeForTool = (t: MarkupTool | null): Shape | null =>
  t === "pen" || t === "highlighter" || t === "eraser" || t === "rect" || t === "ellipse" || t === "arrow" || t === "line"
    ? t
    : null;

export function MarkupCanvas({
  annotations,
  tool,
  color,
  size,
  width,
  height,
  onAdd,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draftRef = useRef<Annotation | null>(null);
  const [, forceDraw] = useState(0);
  const [hover, setHover] = useState<Point | null>(null);
  const interactive = tool !== null;
  const isFreehand = tool !== null && FREEHAND.has(tool as Shape);

  const setDraft = (d: Annotation | null) => {
    draftRef.current = d;
    forceDraw((n) => n + 1);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderMarkup(ctx, annotations, width, height, draftRef.current);
  });

  const rect = () => canvasRef.current!.getBoundingClientRect();
  const toNorm = (e: React.PointerEvent): Point => {
    const r = rect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };
  const toLocal = (e: React.PointerEvent): Point => {
    const r = rect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!interactive) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    const kind = shapeForTool(tool);
    if (!kind) return;
    const p = toNorm(e);
    setDraft({ kind, color, size, points: [p, p] });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!interactive) return;
    setHover(toLocal(e));
    const d = draftRef.current;
    if (!d) return;
    const p = toNorm(e);
    if (FREEHAND.has(d.kind)) setDraft({ ...d, points: [...d.points, p] });
    else setDraft({ ...d, points: [d.points[0], p] });
  };

  const finish = (e: React.PointerEvent) => {
    if (!interactive) return;
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const d = draftRef.current;
    if (d) {
      const freehand = FREEHAND.has(d.kind);
      const a = d.points[0];
      const b = d.points[d.points.length - 1];
      const moved = Math.hypot(a.x - b.x, a.y - b.y) > 0.004;
      if (freehand || moved) onAdd(d);
    }
    setDraft(null);
  };

  const cursor = isFreehand ? "none" : shapeForTool(tool) ? "crosshair" : "default";
  const brush = Math.max(2, size * height);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ pointerEvents: interactive ? "auto" : "none", cursor, touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onPointerLeave={() => setHover(null)}
        onPointerEnter={(e) => setHover(toLocal(e))}
      />
      {isFreehand && hover && (
        <div
          className="pointer-events-none absolute rounded-full"
          style={{
            left: hover.x,
            top: hover.y,
            width: brush,
            height: brush,
            transform: "translate(-50%, -50%)",
            border:
              tool === "eraser"
                ? "1px dashed rgba(255,255,255,0.9)"
                : `1px solid ${color}`,
            background:
              tool === "eraser" ? "rgba(255,255,255,0.12)" : `${color}33`,
            boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
          }}
        />
      )}
    </>
  );
}
