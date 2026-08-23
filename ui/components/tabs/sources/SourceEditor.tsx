import { lazy, Suspense, useState } from "react";
import { Check, FileCode2, Save, X } from "lucide-react";
import { Button } from "@/components/primitives/button";
import { Input } from "@/components/primitives/input";
import { Select } from "@/components/primitives/select";
import { SubLabel } from "@/components/tabs/sources/SubLabel";
import { useProject } from "@/state/AppState";

const CodeEditor = lazy(() =>
  import("@/components/tabs/editor/CodeEditor").then((m) => ({ default: m.CodeEditor })),
);

export function SourceEditor({
  sourceId,
  scriptFor,
  setScript,
}: {
  sourceId: string;
  scriptFor: (id: string) => string;
  setScript: (id: string, s: string) => void;
}) {
  const { templates, saveTemplate } = useProject();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const script = scriptFor(sourceId);
  const onChange = (v: string) => setScript(sourceId, v);

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
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-stretch justify-between bg-[#0b0b0e]">
        <div className="flex items-center">
          <SubLabel icon={<FileCode2 className="size-3" />}>Editor</SubLabel>
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

      <div className="min-h-0 flex-1 overflow-hidden rounded-tl-[6px]">
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
