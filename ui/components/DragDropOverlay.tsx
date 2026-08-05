import { Upload } from "lucide-react";

export function DragDropOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm">
      <Upload className="size-10 text-primary" />
      <div className="text-sm font-semibold text-foreground">Drop files to add sources</div>
      <div className="text-xs text-muted-foreground">
        Each file is added as a new source
      </div>
    </div>
  );
}
