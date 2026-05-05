import { supportsFileSystemAccess } from "@/lib/fileDirectoryStorage";
import { getIsTauri } from "@/utils/tauriDetection";
import { tauriReadVaultFile } from "@/lib/tauriVaultIo";

const DATA_FILE = "household-finance-data.json";

export type VaultFolderPick =
  | { kind: "browser"; handle: FileSystemDirectoryHandle }
  | { kind: "desktop"; path: string };

/** Chromium file picker OR Tauri dialog (desktop bundle). */
export function canPickVaultFolder(): boolean {
  return supportsFileSystemAccess() || getIsTauri();
}

/** Returns null when the user cancels or the environment cannot pick folders. */
export async function pickVaultFolder(): Promise<VaultFolderPick | null> {
  if (getIsTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const sel = await open({
      directory: true,
      multiple: false,
    });
    if (typeof sel === "string" && sel.trim()) return { kind: "desktop", path: sel };
    return null;
  }
  if (!supportsFileSystemAccess()) return null;
  const picker = (
    window as unknown as {
      showDirectoryPicker?: (o?: { mode: string }) => Promise<FileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker;
  if (!picker) return null;
  const handle = await picker.call(window, { mode: "readwrite" });
  return { kind: "browser", handle };
}

async function readFileFromBrowserHandle(handle: FileSystemDirectoryHandle): Promise<string> {
  const fh = await handle.getFileHandle(DATA_FILE, { create: true });
  const file = await fh.getFile();
  return file.text();
}

export async function readVaultRawFromPick(pick: VaultFolderPick): Promise<string> {
  if (pick.kind === "desktop") return (await tauriReadVaultFile(pick.path)).trim();
  return (await readFileFromBrowserHandle(pick.handle)).trim();
}
