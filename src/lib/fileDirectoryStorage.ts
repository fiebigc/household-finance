const DB_NAME = "household-finance-fs";
const STORE_NAME = "meta";
const HANDLE_KEY = "data-directory";

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

export function supportsFileSystemAccess(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
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

export async function ensureDirectoryPermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  const q = await handle.queryPermission({ mode: "readwrite" });
  if (q === "granted") return true;
  const r = await handle.requestPermission({ mode: "readwrite" });
  return r === "granted";
}
