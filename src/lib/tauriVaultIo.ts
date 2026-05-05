/** Native desktop read/write invoked only when bundled in Tauri. */
export async function tauriReadVaultFile(dir: string): Promise<string> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string>("read_vault_file", { dir }).catch(() => "");
  } catch {
    return "";
  }
}

export async function tauriWriteVaultFile(dir: string, contents: string): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("write_vault_file", { dir, contents });
}
