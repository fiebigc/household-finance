import { supabaseAdapter } from "@/adapter/supabase";
import { fileJsonAdapter } from "@/adapter/fileJson";
import type { BackendAdapter } from "@/adapter/index";
import type { DataStorageMode } from "@/stores/appStore";
import { useAppStore } from "@/stores/appStore";

export function getBackend(mode: DataStorageMode): BackendAdapter {
  return mode === "file" ? fileJsonAdapter : supabaseAdapter;
}

export function useBackend(): BackendAdapter {
  const mode = useAppStore((s) => s.dataStorageMode);
  return getBackend(mode);
}
