import { useEffect, useRef, useState } from "react";
import { CircleCheckBig, Copy, ExternalLink, GripVertical, HelpCircle, Loader2, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { listen } from "@tauri-apps/api/event";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/primitives/modal";
import { Button } from "@/components/primitives/button";
import { Input } from "@/components/primitives/input";
import { CheckboxField } from "@/components/primitives/checkbox";
import { Tooltip } from "@/components/primitives/tooltip";
import { Segmented } from "@/components/settings/Segmented";
import { Select } from "@/components/primitives/select";
import { TitleSearch } from "@/components/share/TitleSearch";
import { TagInput } from "@/components/share/TagInput";
import { SortableList, SortableRow } from "@/components/primitives/sortable";
import { Expiration } from "@/components/share/Expiration";
import {
  autofillTags,
  openUrl,
  setSlowpicsCookie,
  type Provider,
  type SaveProgress,
  type TagOption,
  type TmdbTitle,
  type UploadOpts,
} from "@/lib/tauri";
import { useAppSettings, useProject } from "@/state/AppState";
import { toast } from "@/lib/toast";

const PROVIDER_OPTIONS: { value: Provider; label: string }[] = [
  { value: "slowpics", label: "https://slow.pics" },
  { value: "comppics", label: "https://comp.pics" },
];

const VISIBILITY_OPTIONS = [
  ["public", "Public"],
  ["linkonly", "Unlisted"],
] as const satisfies readonly (readonly [string, string])[];

interface Props {
  upload: (opts: UploadOpts) => Promise<string>;
  onClose: () => void;
}

export function ShareModal({ upload, onClose }: Props) {
  const { appSettings, saveAppSettings } = useAppSettings();
  const { settings, projectName, setProjectName, setSourceName, reorderSources } = useProject();

  const [provider, setProvider] = useState<Provider>("slowpics");
  const [title, setTitle] = useState<TmdbTitle | null>(null);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [isPublic, setIsPublic] = useState(true);
  const [nsfw, setNsfw] = useState(false);
  const [cookie, setCookie] = useState(appSettings.slowpicsCookie);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<SaveProgress | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const sources = settings.sources;
  const columns = sources.filter((s) => s.path);
  const readyCount = columns.length;
  const comparisonCount = settings.comparisons.length;

  const canShare =
    projectName.trim().length > 0 && readyCount >= 1 && comparisonCount >= 1 && !uploading;

  useEffect(() => {
    const un = listen<SaveProgress>("upload-progress", (e) => setProgress(e.payload));
    return () => {
      void un.then((f) => f());
    };
  }, []);

  const prevAutoTags = useRef<Set<string>>(new Set());
  const autoTagSeq = useRef(0);
  useEffect(() => {
    const name = projectName.trim();
    const handle = setTimeout(async () => {
      const id = ++autoTagSeq.current;
      let auto: TagOption[] = [];
      try {
        auto = name ? await autofillTags(name) : [];
      } catch (e) {
        console.error("[tags] autofillTags failed", e);
        auto = [];
      }
      if (id !== autoTagSeq.current) return;
      setTags((current) => {
        const merged: TagOption[] = [];
        const seen = new Set<string>();
        for (const t of [
          ...current.filter((t) => !prevAutoTags.current.has(t.value)),
          ...auto,
        ]) {
          if (!seen.has(t.value)) {
            seen.add(t.value);
            merged.push(t);
          }
        }
        return merged;
      });
      prevAutoTags.current = new Set(auto.map((t) => t.value));
    }, 200);
    return () => clearTimeout(handle);
  }, [projectName]);

  const onShare = async () => {
    setUploading(true);
    setProgress({ done: 0, total: comparisonCount * Math.max(1, readyCount) });
    try {
      const url = await upload({
        provider,
        name: projectName,
        tags: tags.map((t) => (provider === "comppics" ? t.label : t.value)),
        expireDays: appSettings.expirationEnabled ? appSettings.expirationDays : null,
        expirationType: appSettings.expirationType,
        title,
        visibility: isPublic,
        nsfw,
      });
      setResultUrl(url);
    } catch (e) {
      toast({ kind: "error", msg: `Upload failed: ${String(e)}` });
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  const copyUrl = async () => {
    if (!resultUrl) return;
    try {
      await navigator.clipboard.writeText(resultUrl);
      toast({ kind: "success", msg: "Link copied" });
    } catch {
      toast({ kind: "error", msg: "Could not copy the link" });
    }
  };

  const percent = progress
    ? String(progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0).padStart(2, "0")
    : "00";

  const footer = (
    <div className="flex w-full items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {provider === "slowpics" && (
          <>
            <Segmented<string>
              value={isPublic ? "public" : "linkonly"}
              options={VISIBILITY_OPTIONS}
              onChange={(v) => setIsPublic(v === "public")}
            />
            <div className="flex items-center gap-1.5">
              <CheckboxField checked={nsfw} onCheckedChange={setNsfw} label="NSFW" />
              <Tooltip label="Check this box if at least one image in this comparison contains images that are not suitable for minors (nudity, gore, etc.).">
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="What NSFW means"
                  className="flex cursor-default text-muted-foreground/60 outline-none transition-colors hover:text-foreground"
                >
                  <HelpCircle className="size-3.5" />
                </button>
              </Tooltip>
            </div>
          </>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={uploading}>
          Cancel
        </Button>
        <Button size="sm" onClick={onShare} disabled={!canShare} className="min-w-[6.5rem]">
          {uploading ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Uploading... {percent}%
            </>
          ) : (
            "Upload"
          )}
        </Button>
      </div>
    </div>
  );

  const overlay = (
    <div
      className={cn(
        "absolute inset-0 flex flex-col items-center justify-evenly bg-popover px-6 text-center transition-opacity duration-300",
        resultUrl ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      {resultUrl && (
        <>
          <div className="flex flex-col items-center gap-1.5">
            <CircleCheckBig className="size-16 text-green-500" strokeWidth={1.5} />
            <span className="text-base font-medium text-foreground">Uploaded</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-white p-2.5">
            <QRCodeSVG value={resultUrl} size={32 * 8} bgColor="#ffffff" fgColor="#0d0d10" marginSize={1} />
          </div>
          <div className="flex w-full max-w-sm items-center gap-2">
            <Input
              readOnly
              value={resultUrl}
              className="h-9 flex-1"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button variant="secondary" size="icon-sm" onClick={copyUrl} title="Copy link">
              <Copy className="size-4" />
            </Button>
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={() => void openUrl(resultUrl).catch(() => {})}
              title="Open in browser"
            >
              <ExternalLink className="size-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <Modal
      title="Share comparison"
      onClose={onClose}
      className="max-w-lg"
      footer={footer}
      overlay={overlay}
    >
      <div
        className={cn(
          "flex flex-col gap-5 transition-opacity duration-300",
          resultUrl && "pointer-events-none opacity-0",
        )}
      >
        <Field label="Share to">
          <span className="-mt-1 text-xs text-muted-foreground/70">
            Publicly upload this comparison to the selected site to get a link you can
            share with anyone.
          </span>
          <Select<Provider> value={provider} options={PROVIDER_OPTIONS} onValueChange={setProvider} />
        </Field>

        <Field label="Comparison name">
          <Input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Required"
            className="h-9"
          />
        </Field>

        <Field label="Movie or TV Show Name">
          <TitleSearch value={title} onChange={setTitle} placeholder="Search for a title (optional)" />
        </Field>

        <Field label="Column names">
          {readyCount === 0 ? (
            <span className="text-xs text-muted-foreground/70">Add sources to name the columns.</span>
          ) : (
            <SortableList
              ids={columns.map((s) => s.id)}
              onReorder={(activeId, overId) => {
                const from = sources.findIndex((s) => s.id === activeId);
                const to = sources.findIndex((s) => s.id === overId);
                if (from >= 0 && to >= 0) reorderSources(from, to);
              }}
            >
              <div className="flex flex-col gap-2">
                {columns.map((s, i) => (
                  <SortableRow key={s.id} id={s.id}>
                    {({ setNodeRef, style, attributes, listeners, isDragging }) => (
                      <div
                        ref={setNodeRef}
                        style={style}
                        className={cn("flex items-center gap-2", isDragging && "opacity-90")}
                      >
                        <button
                          type="button"
                          {...attributes}
                          {...listeners}
                          title="Drag to reorder columns"
                          className="flex h-8 shrink-0 cursor-grab items-center text-muted-foreground/40 outline-none hover:text-foreground active:cursor-grabbing"
                        >
                          <GripVertical className="size-3.5" />
                        </button>
                        <span className="w-4 shrink-0 text-center font-mono text-xs font-semibold text-muted-foreground">
                          {String.fromCharCode(65 + i)}
                        </span>
                        <Input
                          value={s.name}
                          onChange={(e) => setSourceName(s.id, e.target.value)}
                          placeholder={s.path?.split(/[\\/]/).pop() ?? ""}
                          className="h-8 flex-1"
                        />
                      </div>
                    )}
                  </SortableRow>
                ))}
              </div>
            </SortableList>
          )}
        </Field>

        <Field label="Tags">
          <TagInput value={tags} onChange={setTags} placeholder="Search tags (optional)" />
        </Field>

        <Field label="Expiration">
          <Expiration
            enabled={appSettings.expirationEnabled}
            onEnabledChange={(v) => void saveAppSettings({ ...appSettings, expirationEnabled: v })}
            days={appSettings.expirationDays}
            onDaysChange={(v) => void saveAppSettings({ ...appSettings, expirationDays: v })}
            type={appSettings.expirationType}
            onTypeChange={(v) => void saveAppSettings({ ...appSettings, expirationType: v })}
          />
        </Field>

        {provider === "comppics" ? (
          <Field label="API Key">
            <Input
              type="password"
              value={appSettings.compPicsApiKey}
              onChange={(e) => void saveAppSettings({ ...appSettings, compPicsApiKey: e.target.value })}
              placeholder="Optional"
              aria-label="API key"
              spellCheck={false}
              autoComplete="off"
              className="h-9"
            />
          </Field>
        ) : (
          <Field label="Cookie">
            <div className="flex items-center gap-2">
              <Input
                type="password"
                value={cookie}
                readOnly={!!cookie}
                onChange={(e) => {
                  setCookie(e.target.value);
                  void setSlowpicsCookie(e.target.value);
                }}
                placeholder="Optional: paste remember-me cookie"
                aria-label="slow.pics cookie"
                spellCheck={false}
                autoComplete="off"
                className="h-9 flex-1"
              />
              {cookie && (
                <Button
                  variant="secondary"
                  size="icon-sm"
                  onClick={() => {
                    setCookie("");
                    void setSlowpicsCookie("");
                  }}
                  title="Clear cookie"
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>
          </Field>
        )}

        {comparisonCount === 0 && (
          <span className="text-xs text-muted-foreground/70">
            Add at least one comparison in the Export tab before sharing.
          </span>
        )}
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-foreground/90">{label}</span>
      {children}
    </div>
  );
}
