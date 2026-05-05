import { supabaseAdapter } from "@/adapter/supabase";
import { fileJsonAdapter } from "@/adapter/fileJson";
import type { BackendAdapter } from "@/adapter/index";
import type { DataStorageMode } from "@/stores/appStore";
import { useAppStore } from "@/stores/appStore";
import { IS_WEBKIT_STANDALONE } from "@/constants/buildTarget";
import { mockAdapter } from "@/adapter/mock";

export function getBackend(mode: DataStorageMode): BackendAdapter {
  if (mode === "demo") return mockAdapter;
  if (IS_WEBKIT_STANDALONE) return fileJsonAdapter;
  return mode === "file" ? fileJsonAdapter : supabaseAdapter;
}

export function useBackend(): BackendAdapter {
  const mode = useAppStore((s) => s.dataStorageMode);
  return getBackend(mode);
}
