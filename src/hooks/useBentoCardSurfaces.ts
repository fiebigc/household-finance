import { useCallback, useEffect, useState } from "react";
import {
  type BentoCardSurfaceId,
  type BentoCardSurfaceTheme,
  buildDefaultMixMap,
  type BentoSurfacePresetId,
  applyBentoSurfacePreset,
} from "../config/bentoCardSurfaces";

const STORAGE_KEY = "finances.bentoSurfaces.v1";

function loadStoredMap(): Record<BentoCardSurfaceId, BentoCardSurfaceTheme> | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Record<BentoCardSurfaceId, BentoCardSurfaceTheme>;
  } catch {
    return null;
  }
}

function mergeWithDefaults(
  partial: Record<BentoCardSurfaceId, BentoCardSurfaceTheme> | null,
): Record<BentoCardSurfaceId, BentoCardSurfaceTheme> {
  const base = buildDefaultMixMap();
  if (!partial) return base;
  return { ...base, ...partial };
}

export function useBentoCardSurfaces() {
  const [surfaceMap, setSurfaceMap] = useState<Record<
    BentoCardSurfaceId,
    BentoCardSurfaceTheme
  >>(() => mergeWithDefaults(loadStoredMap()));

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(surfaceMap));
    } catch {
      /* ignore quota */
    }
  }, [surfaceMap]);

  const setSurface = useCallback((id: BentoCardSurfaceId, theme: BentoCardSurfaceTheme) => {
    setSurfaceMap((prev) => ({ ...prev, [id]: theme }));
  }, []);

  const applyPreset = useCallback((presetId: BentoSurfacePresetId) => {
    setSurfaceMap(applyBentoSurfacePreset(presetId));
  }, []);

  const resetToDefaultMix = useCallback(() => {
    setSurfaceMap(buildDefaultMixMap());
  }, []);

  const surfaceFor = useCallback(
    (id: BentoCardSurfaceId): BentoCardSurfaceTheme => surfaceMap[id] ?? "light",
    [surfaceMap],
  );

  return {
    surfaceMap,
    setSurface,
    applyPreset,
    resetToDefaultMix,
    surfaceFor,
  };
}
