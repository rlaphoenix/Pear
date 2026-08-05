import { useEffect, useRef, type CSSProperties } from "react";
import { decodeFrame } from "@/lib/utils";
import type { SourceOut } from "@/lib/tauri";

interface Props {
  frame: SourceOut;
  className?: string;
  style?: CSSProperties;
  onPainted?: (src: string) => void;
}

export function FrameCanvas({ frame, className, style, onPainted }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const onPaintedRef = useRef(onPainted);
  useEffect(() => {
    onPaintedRef.current = onPainted;
  });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let alive = true;
    decodeFrame(frame)
      .then((bmp) => {
        if (!alive) {
          bmp.close();
          return;
        }
        canvas.width = frame.w;
        canvas.height = frame.h;
        canvas.getContext("2d")?.drawImage(bmp, 0, 0);
        bmp.close();
        onPaintedRef.current?.(frame.src);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [frame]);

  return <canvas ref={ref} width={frame.w} height={frame.h} className={className} style={style} />;
}
