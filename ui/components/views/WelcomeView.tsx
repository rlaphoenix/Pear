import { FolderOpen, Film, X } from "lucide-react";
import { Button } from "@/components/primitives/button";
import { AddSourcesButton } from "@/components/AddSourcesButton";
import type { RecentProject } from "@/lib/tauri";

interface Props {
  onAddSources: () => void;
  onLoadProject: () => void;
  recents: RecentProject[];
  onOpenRecent: (path: string) => void;
  onRemoveRecent: (path: string) => void;
}

const STEPS = [
  "Click Add Sources or drag and drop video/image files into this window to compare them.",
  "Adjust the clip offset on the timeline to align the videos.",
  "Add overlay markup to annotate your comparison.",
];

export function WelcomeView({
  onAddSources,
  onLoadProject,
  recents,
  onOpenRecent,
  onRemoveRecent,
}: Props) {
  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-panel p-10">
      <div className="flex max-h-full min-h-0 w-full max-w-5xl flex-col gap-8 md:flex-row md:items-stretch md:gap-16">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <h1 className="shrink-0 text-3xl font-semibold tracking-tight">Let's get started</h1>

          <ol className="mt-6 flex shrink-0 flex-col gap-8">
            {STEPS.map((text, i) => (
              <li key={text} className="flex items-start gap-4">
                <span className="flex size-8 shrink-0 items-center justify-center border border-border font-mono text-sm text-foreground/80">
                  {i + 1}
                </span>
                <span className="pt-1 text-sm leading-relaxed text-foreground/85">{text}</span>
              </li>
            ))}
          </ol>

          <div aria-hidden className="min-h-6 shrink grow-0 basis-64" />

          <div className="flex shrink-0 flex-col gap-2">
            <AddSourcesButton
              onClick={onAddSources}
              className="h-11 w-full justify-center px-6"
            />
            <Button
              variant="secondary"
              size="lg"
              onClick={onLoadProject}
              className="w-full justify-center"
            >
              <FolderOpen className="size-4" />
              Load Project
            </Button>
          </div>
        </div>

        <div className="flex w-full flex-col md:w-[512px]">
          <h2 className="text-3xl font-semibold tracking-tight">Recent projects</h2>
          <div className="mt-6 flex min-h-0 flex-1 flex-col">
            <div className="min-h-[180px] flex-1 overflow-auto border border-border bg-[#0d0d10]">
              {recents.length === 0 ? (
                <div className="flex h-full min-h-[160px] items-center justify-center px-4 text-center text-xs text-muted-foreground/60">
                  No recent projects yet.
                </div>
              ) : (
                <ul className="flex flex-col">
                  {recents.map((r) => (
                    <li key={r.path} className="flex items-stretch border-b border-border/50">
                      <button
                        type="button"
                        onClick={() => onOpenRecent(r.path)}
                        title={r.path}
                        className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left outline-none hover:bg-accent"
                      >
                        <span className="flex aspect-video w-28 shrink-0 items-center justify-center overflow-hidden border border-border bg-black">
                          {r.thumbnail ? (
                            <img
                              src={r.thumbnail}
                              alt=""
                              draggable={false}
                              className="pointer-events-none h-full w-full object-contain"
                            />
                          ) : (
                            <Film className="size-6 text-muted-foreground/40" />
                          )}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-sm font-medium text-foreground/90">
                            {r.name}
                          </span>
                          <span className="truncate font-mono text-[11px] text-muted-foreground/60">
                            {r.path}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveRecent(r.path)}
                        title="Remove from recents"
                        className="flex w-8 shrink-0 items-center justify-center text-muted-foreground/40 outline-none hover:text-destructive"
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
