import { lazy, Suspense, useEffect, useState } from "react";
import { Check, Save, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/primitives/button";
import { Input } from "@/components/primitives/input";
import { Select } from "@/components/primitives/select";
import type { UiSource } from "@/state/AppState";
import { useProject } from "@/state/AppState";

const CodeEditor = lazy(() =>
  import("@/components/tabs/editor/CodeEditor").then((m) => ({ default: m.CodeEditor })),
);

interface Props {
  scriptFor: (id: string) => string;
  setScript: (id: string, s: string) => void;
}

const fileName = (s: UiSource) => s.name || s.path?.split(/[\\/]/).pop() || "no file";

export function EditorTab({ scriptFor, setScript }: Props) {
  const { settings, templates, saveTemplate } = useProject();
  const sources = settings.sources;
  const [selId, setSelId] = useState<string | null>(sources[0]?.id ?? null);
  useEffect(() => {
    if (!sources.some((s) => s.id === selId)) setSelId(sources[0]?.id ?? null);
  }, [sources, selId]);
  const selected = sources.find((s) => s.id === selId) ?? sources[0];

  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  if (!selected) {
    return (
      <div className="flex h-full items-center justify-center bg-panel text-sm text-muted-foreground/60">
        No sources
      </div>
    );
  }

  const script = scriptFor(selected.id);
  const onChange = (v: string) => setScript(selected.id, v);

  const templateOptions = [
    { value: "", label: templates.length ? "Load template…" : "No templates" },
    ...templates.map((t) => ({ value: t.name, label: t.name })),
  ];

  const commitSave = () => {
    const n = name.trim();
    if (n) saveTemplate(n, script);
    setName("");
    setNaming(false);
  };

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex h-9 shrink-0 items-stretch border-b border-border bg-[#0b0b0e]">
        <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
          {sources.map((s) => {
            const activeTab = s.id === selected.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelId(s.id)}
                title={fileName(s)}
                className={cn(
                  "flex shrink-0 items-center whitespace-nowrap border-r border-border px-3 text-xs outline-none transition-colors",
                  activeTab
                    ? "bg-panel text-foreground"
                    : "text-muted-foreground hover:text-foreground/80",
                )}
              >
                {fileName(s)}
              </button>
            );
          })}
        </div>

        {naming ? (
          <div className="flex items-center gap-1 pr-1 pl-2">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitSave();
                if (e.key === "Escape") setNaming(false);
              }}
              placeholder="template name"
              className="h-7 w-36 font-sans"
            />
            <Button size="icon-sm" onClick={commitSave} title="Save">
              <Check className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => setNaming(false)} title="Cancel">
              <X className="size-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex shrink-0 items-stretch">
            <Select
              value=""
              options={templateOptions}
              disabled={!templates.length}
              onValueChange={(v) => {
                const t = templates.find((t) => t.name === v);
                if (t) onChange(t.script);
              }}
              className="h-9 w-44 rounded-none border-y-0 border-r-0"
            />
            <Button
              variant="secondary"
              title="Save as template"
              onClick={() => setNaming(true)}
              className="h-9 rounded-none border-y-0 border-r-0 px-3"
            >
              <Save className="size-3.5" />
            </Button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <Suspense fallback={<div className="h-full w-full bg-panel" />}>
          <CodeEditor
            value={script}
            onChange={onChange}
            placeholder={
              "# clip is preloaded from this source.\n# Example:\n# clip = core.std.Crop(clip, top=20, bottom=20)\n# clip = clip.resize.Spline36(1920, 1080)"
            }
          />
        </Suspense>
      </div>
    </div>
  );
}
