/**
 * One-shot JSON backup picker — works in the browser File System Access flow and inside the Tauri webview.
 */
export function pickAndReadHouseholdBackupJson(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json,text/json";
    const done = () => {
      input.remove();
    };

    input.addEventListener(
      "change",
      async () => {
        const file = input.files?.[0];
        if (!file) {
          done();
          resolve(null);
          return;
        }
        try {
          resolve(await file.text());
        } catch {
          resolve(null);
        } finally {
          done();
        }
      },
      { once: true },
    );

    // Some Chromium builds fire `cancel`; others leave the promise pending if dismissed with no selection.
    input.addEventListener(
      "cancel",
      () => {
        resolve(null);
        done();
      },
      { once: true },
    );

    input.click();
  });
}
