import { useEffect, useRef, useState } from "react";
import { FileVideo, FolderOpen, Loader2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { cn, MEDIA_EXTS } from "@/lib/utils";
import { Button } from "@/components/primitives/button";
import { SubLabel } from "@/components/primitives/section";
import { fileExists } from "@/lib/tauri";
import { type UiSource } from "@/state/AppState";
import { useProject } from "@/state/AppState";

function darRatio(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  if (/^\d+(?:\.\d+)?$/.test(t)) {
    const n = parseFloat(t);
    return n > 0 ? n : 0;
  }
  const m = t.match(/^(\d+(?:\.\d+)?)\s*[/:]\s*(\d+(?:\.\d+)?)$/);
  if (m) {
    const b = parseFloat(m[2]);
    return b > 0 ? parseFloat(m[1]) / b : 0;
  }
  return 0;
}

export function FileInputField({ source }: { source: UiSource }) {
  const ctx = useProject();
  const onSetPath = (path: string) => ctx.setSourcePath(source.id, path);

  const [pathText, setPathText] = useState(source.path ?? "");
  const [pathError, setPathError] = useState(false);
  const pathTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (pathTimer.current) clearTimeout(pathTimer.current);
    },
    [],
  );
  const onPathText = (v: string) => {
    setPathText(v);
    if (pathTimer.current) clearTimeout(pathTimer.current);
    pathTimer.current = setTimeout(async () => {
      const t = v.trim();
      if (!t || t === (source.path ?? "")) {
        setPathError(false);
        return;
      }
      const ok = await fileExists(t).catch(() => false);
      setPathError(!ok);
      if (ok) onSetPath(t);
    }, 500);
  };
  const browse = async () => {
    const picked = await open({
      directory: false,
      multiple: false,
      title: "Choose source file",
      filters: [
        { name: "Video / image files", extensions: MEDIA_EXTS },
        { name: "All files", extensions: ["*"] },
      ],
    });
    if (typeof picked === "string") {
      setPathText(picked);
      setPathError(false);
      onSetPath(picked);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <SubLabel icon={<FileVideo className="size-3" />}>File</SubLabel>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={pathText}
          spellCheck={false}
          aria-label="File path"
          placeholder="Paste a file path, or browse"
          onChange={(e) => onPathText(e.target.value)}
          title={pathText || undefined}
          className={cn(
            "h-8 min-w-0 flex-1 select-text border bg-[#0d0d10] px-2 font-mono text-[11px] text-foreground/90 outline-none focus:border-primary/60",
            pathError ? "border-destructive/70" : "border-border",
          )}
        />
        <Button variant="secondary" size="sm" onClick={() => void browse()} className="shrink-0">
          <FolderOpen className="size-3.5" />
          Browse
        </Button>
      </div>
      {pathError ? (
        <div className="text-[10px] text-destructive">That file does not exist.</div>
      ) : typeof source.indexProgress === "number" ? (
        <div className="flex items-center gap-1.5 text-[10px] text-primary">
          <Loader2 className="size-3 animate-spin" />
          {`Indexing… ${Math.round(source.indexProgress)}% (once per file).`}
        </div>
      ) : (
        source.info && (
          <div className="font-mono text-[10px] text-muted-foreground/60">
            {(() => {
              const { width: w, height: h, sar } = source.info;
              const r = darRatio(source.dar);
              const dispW =
                r > 0
                  ? Math.max(1, Math.round(h * r))
                  : sar && Math.abs(sar - 1) > 1e-3
                    ? Math.max(1, Math.round(w * sar))
                    : w;
              const raw = `${w}×${h}`;
              const disp = `${dispW}×${h}`;
              return disp === raw ? raw : `${raw} → ${disp}`;
            })()}{" "}
            · {source.info.fps.toFixed(3)} · {source.info.total}f
          </div>
        )
      )}
    </div>
  );
}
