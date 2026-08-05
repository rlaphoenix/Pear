export type MarkupTool =
  | "pen"
  | "highlighter"
  | "eraser"
  | "rect"
  | "ellipse"
  | "arrow"
  | "line";

export type Shape =
  | "pen"
  | "highlighter"
  | "eraser"
  | "rect"
  | "ellipse"
  | "arrow"
  | "line";

export interface Point {
  x: number;
  y: number;
}

export interface Annotation {
  kind: Shape;
  color: string;
  size: number;
  points: Point[];
}

export interface MarkupState {
  annotations: Annotation[];
  past: Annotation[][];
  future: Annotation[][];
}

export const emptyMarkup = (): MarkupState => ({
  annotations: [],
  past: [],
  future: [],
});

function commit(state: MarkupState, next: Annotation[]): MarkupState {
  return { annotations: next, past: [...state.past, state.annotations], future: [] };
}

export function addAnnotation(state: MarkupState, ann: Annotation): MarkupState {
  return commit(state, [...state.annotations, ann]);
}

export function clearMarkup(state: MarkupState): MarkupState {
  if (state.annotations.length === 0) return state;
  return commit(state, []);
}

export function undo(state: MarkupState): MarkupState {
  if (state.past.length === 0) return state;
  const prev = state.past[state.past.length - 1];
  return {
    annotations: prev,
    past: state.past.slice(0, -1),
    future: [state.annotations, ...state.future],
  };
}

export function redo(state: MarkupState): MarkupState {
  if (state.future.length === 0) return state;
  const next = state.future[0];
  return {
    annotations: next,
    past: [...state.past, state.annotations],
    future: state.future.slice(1),
  };
}

export function renderMarkup(
  ctx: CanvasRenderingContext2D,
  annotations: Annotation[],
  w: number,
  h: number,
  draft?: Annotation | null,
) {
  ctx.clearRect(0, 0, w, h);
  for (const a of annotations) drawAnnotation(ctx, a, w, h);
  if (draft) drawAnnotation(ctx, draft, w, h);
}

function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  a: Annotation,
  w: number,
  h: number,
) {
  if (a.points.length === 0) return;
  const pts = a.points.map((p) => ({ x: p.x * w, y: p.y * h }));
  const lw = Math.max(1, a.size * h);

  ctx.save();
  ctx.strokeStyle = a.color;
  ctx.fillStyle = a.color;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = lw;
  if (a.kind === "highlighter") {
    ctx.globalAlpha = 0.3;
    ctx.lineCap = "butt";
  }
  if (a.kind === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
  }

  if (a.kind === "pen" || a.kind === "highlighter" || a.kind === "eraser") {
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, lw / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
  } else if (a.kind === "line" || a.kind === "arrow") {
    const [p0, p1] = pts;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
    if (a.kind === "arrow") drawArrowHead(ctx, p0, p1, lw);
  } else if (a.kind === "rect") {
    const [p0, p1] = pts;
    ctx.strokeRect(
      Math.min(p0.x, p1.x),
      Math.min(p0.y, p1.y),
      Math.abs(p1.x - p0.x),
      Math.abs(p1.y - p0.y),
    );
  } else if (a.kind === "ellipse") {
    const [p0, p1] = pts;
    ctx.beginPath();
    ctx.ellipse(
      (p0.x + p1.x) / 2,
      (p0.y + p1.y) / 2,
      Math.abs(p1.x - p0.x) / 2,
      Math.abs(p1.y - p0.y) / 2,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }
  ctx.restore();
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  lw: number,
) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const head = Math.max(lw * 3.2, 10);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - head * Math.cos(angle - Math.PI / 6),
    to.y - head * Math.sin(angle - Math.PI / 6),
  );
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - head * Math.cos(angle + Math.PI / 6),
    to.y - head * Math.sin(angle + Math.PI / 6),
  );
  ctx.stroke();
}

export function exportMarkup(
  annotations: Annotation[],
  w: number,
  h: number,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  renderMarkup(ctx, annotations, w, h);
  return canvas.toDataURL("image/png");
}

export function flattenWithMarkup(
  baseDataUrl: string,
  annotations: Annotation[],
  w: number,
  h: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      // renderMarkup clears its target first, so draw the markup on its own
      // canvas and composite that over the base frame.
      const overlay = document.createElement("canvas");
      overlay.width = w;
      overlay.height = h;
      renderMarkup(overlay.getContext("2d")!, annotations, w, h);
      ctx.drawImage(overlay, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("failed to load frame"));
    img.src = baseDataUrl;
  });
}
