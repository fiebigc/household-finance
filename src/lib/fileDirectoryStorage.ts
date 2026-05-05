const DB_NAME = "household-finance-fs";
const STORE_NAME = "meta";
const HANDLE_KEY = "data-directory";
const DESKTOP_PATH_LS = "fin:desktop-vault-path";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
  });
}

/** Browser exposes the File System Access directory picker (Chromium desktop). */
export function supportsFileSystemAccess(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/** Remembered vault folder via Tauri-native path persistence (cannot store handles in IndexedDB reliably). */
export function getPersistedDesktopVaultPath(): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(DESKTOP_PATH_LS) : null;
  } catch {
    return null;
  }
}

export function setPersistedDesktopVaultPath(path: string | null): void {
  try {
    if (!path) localStorage.removeItem(DESKTOP_PATH_LS);
    else localStorage.setItem(DESKTOP_PATH_LS, path);
  } catch {
    /* ignore */
  }
}

export async function saveDirectoryHandleToIdb(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
  });
}

export async function loadDirectoryHandleFromIdb(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    tx.onerror = () => reject(tx.error);
    const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
    req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle | undefined) ?? null);
  });
}

export async function clearDirectoryHandleFromIdb(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE_NAME).delete(HANDLE_KEY);
  });
}

/**
 * Clears both browser remembered handle and desktop remembered path when user “forgets” the vault folder.
 */
export async function clearAllVaultFolderPersistence(): Promise<void> {
  setPersistedDesktopVaultPath(null);
  await clearDirectoryHandleFromIdb();
}

/**
 * True only if read/write permission is already granted. Safe to call on page load
 * (does not invoke requestPermission, which requires a user gesture).
 */
export async function hasReadWriteDirectoryPermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  try {
    const q = await handle.queryPermission({ mode: "readwrite" });
    return q === "granted";
  } catch {
    return false;
  }
}

export async function ensureDirectoryPermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  const q = await handle.queryPermission({ mode: "readwrite" });
  if (q === "granted") return true;
  try {
    const r = await handle.requestPermission({ mode: "readwrite" });
    return r === "granted";
  } catch {
    return false;
  }
}
