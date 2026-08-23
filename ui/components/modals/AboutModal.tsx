import { type ReactNode } from "react";
import { FolderOpen } from "lucide-react";
import { Modal } from "@/components/primitives/modal";
import { openUrl, openVapoursynthFolder } from "@/lib/tauri";
import { useAppSettings } from "@/state/AppState";

const REPO = "https://github.com/rlaphoenix/pear";

const SHORTCUTS: { keys: string; desc: string }[] = [
  { keys: "Space", desc: "Playback: Play / pause" },
  { keys: "← / →", desc: "Seek: Previous / next frame" },
  { keys: "↑ / ↓", desc: "Seek: Previous / next keyframe" },
  { keys: "Ctrl + ← / →", desc: "Seek: Previous / next segment" },
  { keys: "Scroll", desc: "Preview: Zoom" },
  { keys: "Drag", desc: "Preview: Pan when zoomed in" },
  { keys: "Click zoom %", desc: "Preview: Toggle 100% ↔ fit" },
  { keys: "F11", desc: "Preview: Toggle Fullscreen" },
  { keys: "V", desc: "Timeline: Select tool" },
  { keys: "B", desc: "Timeline: Razor tool" },
  { keys: "Ctrl + Z", desc: "Timeline: Undo" },
  { keys: "Ctrl + Y  /  Ctrl + Shift + Z", desc: "Timeline: Redo" },
  { keys: "Del / Backspace", desc: "Timeline: Delete selected clip" },
  { keys: "Ctrl + Scroll", desc: "Timeline: Zoom in / out" },
  { keys: "Ctrl + S", desc: "Save project" },
  { keys: "Ctrl + W", desc: "Close project/app" },
  { keys: "F1", desc: "Open GitHub repository" },
  { keys: "F12", desc: "Toggle developer tools" },
];

const CREDITS: { name: string; license: string; url: string; external?: boolean }[] = [
  {
    name: "VapourSynth",
    license: "LGPL-2.1",
    url: "http://www.vapoursynth.com",
    external: true,
  },
  { name: "Tauri", license: "MIT / Apache-2.0", url: "https://tauri.app" },
  { name: "React", license: "MIT", url: "https://react.dev" },
  { name: "Tailwind CSS", license: "MIT", url: "https://tailwindcss.com" },
  { name: "Base UI", license: "MIT", url: "https://base-ui.com" },
  { name: "Lucide", license: "ISC", url: "https://lucide.dev" },
  { name: "image-rs", license: "MIT / Apache-2.0", url: "https://github.com/image-rs/image" },
  {
    name: "vapoursynth-rs",
    license: "MIT / Apache-2.0",
    url: "https://github.com/rust-av/vapoursynth-rs",
  },
];

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => void openUrl(href).catch(() => {})}
      className="cursor-pointer text-primary underline-offset-2 outline-none hover:underline"
    >
      {children}
    </button>
  );
}

const GROUP_LABEL = "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

export function AboutModal({ onClose }: { onClose: () => void }) {
  const { buildInfo: info } = useAppSettings();
  if (!info) return null;

  const { engine, engineUrl } = (() => {
    const ua = navigator.userAgent;
    const chromium = ua.match(/(?:Edg|Chrome|Chromium)\/([\d.]+)/);
    if (chromium) {
      return {
        engine: chromium[1],
        engineUrl: "https://developer.microsoft.com/microsoft-edge/webview2/",
      };
    }
    const webkit = ua.match(/AppleWebKit\/([\d.]+)/);
    return { engine: webkit?.[1] ?? "unknown", engineUrl: "https://webkit.org" };
  })();

  const versions: { name: string; ver: string; url: string }[] = [
    { name: "WebView", ver: engine, url: engineUrl },
    { name: "VapourSynth", ver: info.vapoursynth, url: "http://www.vapoursynth.com" },
    {
      name: "BestSource",
      ver: info.bestsource,
      url: "https://github.com/vapoursynth/bestsource",
    },
  ];

  return (
    <Modal
      title="About"
      onClose={onClose}
      className="max-w-4xl"
      headerActions={
        <button
          type="button"
          onClick={() => void openVapoursynthFolder().catch(() => {})}
          className="flex cursor-pointer items-center gap-1.5 text-xs font-normal text-white/70 outline-none transition-colors hover:text-white"
        >
          <FolderOpen className="size-3.5" />
          Open VapourSynth Folder
        </button>
      }
    >
      <div className="flex gap-12">
        <section className="flex min-w-0 flex-1 flex-col gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <img src="/pear-square.png" alt="Pear" className="size-16 shrink-0" />
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <div className="text-xl font-semibold leading-none text-foreground">Pear</div>
                <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 font-mono text-sm leading-none text-foreground/80">
                  v{info.app}
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                The <span className="italic">PEAR</span>fect Compare Tool!
              </div>
              <div>
                <Link href={REPO}>{REPO}</Link>
              </div>
            </div>
          </div>
          <div className="mt-2 flex flex-col gap-0.5">
            <div>Copyright © 2026 rlaphoenix</div>
            <div>
              Licensed under{" "}
              <Link href="https://choosealicense.com/licenses/gpl-3.0/">GNU GPL v3.0</Link>, with
              absolutely no warranty.
            </div>
          </div>

          <div className={`mt-2 ${GROUP_LABEL}`}>Reporting issues</div>
          <div>
            Found a bug or have a suggestion? Open an issue on{" "}
            <Link href={`${REPO}/issues`}>GitHub</Link>. Please include what you did, what
            you expected, and any error text so it can be reproduced.
          </div>

          <div className={`mt-2 ${GROUP_LABEL}`}>Dependencies</div>
          <ul className="flex flex-col gap-1">
            {versions.map((v) => (
              <li key={v.name} className="flex items-baseline justify-between gap-4">
                <span className="text-foreground/85">
                  <Link href={v.url}>{v.name}</Link>
                </span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground/70">
                  {v.ver}
                </span>
              </li>
            ))}
          </ul>

          <div className={`mt-2 ${GROUP_LABEL}`}>Credits</div>
          <ul className="flex flex-col gap-1">
            {CREDITS.map((c) => (
              <li key={c.name} className="flex items-baseline justify-between gap-4">
                <span className="text-foreground/85">
                  <Link href={c.url}>{c.name}</Link>
                </span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground/70">
                  {c.license}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] leading-normal text-muted-foreground/70">
            No modifications have been made to the software listed above.
            <br />
            A copy of each of their licenses is included in the licenses folder of the install
            directory.
          </p>
        </section>

        <section className="flex w-96 shrink-0 flex-col gap-3">
          <div className="text-base font-semibold text-foreground">Shortcuts</div>
          <ul className="flex flex-col gap-1.5">
            {SHORTCUTS.map((s) => (
              <li key={s.keys} className="flex items-baseline justify-between gap-4">
                <span className="min-w-0 text-xs text-muted-foreground">{s.desc}</span>
                <kbd className="shrink-0 rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-foreground/90">
                  {s.keys}
                </kbd>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Modal>
  );
}
