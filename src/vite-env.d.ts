/// <reference types="vite/client" />

declare module "*?raw" {
  const src: string;
  export default src;
}

/** File System Access API (Chromium) — not in all TS lib.dom versions */
interface FileSystemHandlePermissionDescriptor {
  mode?: "read" | "readwrite";
}

interface FileSystemDirectoryHandle {
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
}

interface FileSystemFileHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemWritableFileStream extends WritableStream {
  write(data: string | BufferSource | Blob): Promise<void>;
  close(): Promise<void>;
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Optional placeholders for labels (see `.env.example`). */
  readonly VITE_ADULT_1_LABEL?: string;
  readonly VITE_ADULT_2_LABEL?: string;
  readonly VITE_CHILD_1_LABEL?: string;
  readonly VITE_CHILD_2_LABEL?: string;
  readonly VITE_TRANSITION_DATE?: string;
  readonly VITE_TINK_CONNECT_API_BASE_URL?: string;
  readonly VITE_TINK_CLIENT_ID?: string;
  readonly VITE_TINK_DEMO_MODE?: string;
  /** Set in `.env.webkit` for the desktop WebKit bundle (no Supabase client). */
  readonly VITE_WEBKIT_STANDALONE?: string;
  readonly VITE_APP_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
