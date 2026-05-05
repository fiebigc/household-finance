/** True inside the desktop Tauri/WebView wrapper (Chrome File System Access API is usually absent). */
export function getIsTauri(): boolean {
  if (typeof window === "undefined") return false;
  return (
    Object.prototype.hasOwnProperty.call(window, "__TAURI_INTERNALS__") ||
    Object.prototype.hasOwnProperty.call(window, "__TAURI__")
  );
}
