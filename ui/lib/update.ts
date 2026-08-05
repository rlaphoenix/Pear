import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const REPO = "rlaphoenix/pear";
const IGNORE_KEY = "pear.ignoredUpdate";

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  url: string;
}

function parseVersion(v: string): number[] {
  return v.replace(/^v/i, "").split(/[.-]/).map((p) => parseInt(p, 10) || 0);
}

function isNewer(a: string, b: string): boolean {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const [currentVersion, res] = await Promise.all([
    getVersion(),
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
    }),
  ]);
  if (!res.ok) return null;
  const data = (await res.json()) as { tag_name?: string; html_url?: string };
  const version = (data.tag_name ?? "").replace(/^v/i, "");
  if (!version || !isNewer(version, currentVersion)) return null;
  return {
    version,
    currentVersion,
    url: data.html_url ?? `https://github.com/${REPO}/releases/latest`,
  };
}

function ignoredVersion(): string {
  try {
    return localStorage.getItem(IGNORE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function isUpdateIgnored(version: string): boolean {
  const ignored = ignoredVersion();
  return ignored !== "" && !isNewer(version, ignored);
}

export function ignoreUpdate(version: string): void {
  try {
    localStorage.setItem(IGNORE_KEY, version);
  } catch {
    /* ignore */
  }
}

export async function installUpdateInApp(
  onProgress?: (fraction: number | null) => void,
): Promise<boolean> {
  const update = await check();
  if (!update) return false;
  let total = 0;
  let downloaded = 0;
  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength ?? 0;
        onProgress?.(total > 0 ? 0 : null);
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress?.(total > 0 ? downloaded / total : null);
        break;
      case "Finished":
        onProgress?.(1);
        break;
    }
  });
  await relaunch();
  return true;
}
