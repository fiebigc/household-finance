import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { PersonaWorkParams } from "@/lib/cashflow";
import { DEFAULT_WORK_PARAMS } from "@/lib/cashflow";

export type PersonaSetting = {
  personaId: string;
  sgiAnnual: number;
  fullTimeGross: number;
  workParams: PersonaWorkParams;
};

const TABLE = "user_persona_settings";

export function usePersonaSettings(userId: string | undefined, userEmail: string | undefined) {
  const [settings, setSettings] = useState<Map<string, PersonaSetting>>(new Map());
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!userId) {
      setSettings(new Map());
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from(TABLE)
        .select("persona_id, sgi_annual, full_time_gross, work_params")
        .eq("user_id", userId);

      if (cancelled) return;
      if (error) {
        console.error("persona settings fetch:", error.message);
        setLoading(false);
        return;
      }

      const map = new Map<string, PersonaSetting>();
      for (const row of data ?? []) {
        map.set(row.persona_id, {
          personaId: row.persona_id,
          sgiAnnual: row.sgi_annual ?? 0,
          fullTimeGross: row.full_time_gross ?? 0,
          workParams: { ...DEFAULT_WORK_PARAMS, ...(row.work_params as Partial<PersonaWorkParams> ?? {}) },
        });
      }
      setSettings(map);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [userId]);

  const upsert = useCallback(
    (personaId: string, patch: Partial<Omit<PersonaSetting, "personaId">>) => {
      if (!userId || !userEmail) return;

      setSettings((prev) => {
        const existing = prev.get(personaId) ?? {
          personaId,
          sgiAnnual: 0,
          fullTimeGross: 0,
          workParams: { ...DEFAULT_WORK_PARAMS },
        };
        const merged: PersonaSetting = {
          ...existing,
          ...patch,
          workParams: patch.workParams
            ? { ...existing.workParams, ...patch.workParams }
            : existing.workParams,
        };
        const next = new Map(prev);
        next.set(personaId, merged);

        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          setSettings((latest) => {
            const row = latest.get(personaId);
            if (!row || !userId || !userEmail) return latest;
            void supabase.from(TABLE).upsert(
              {
                user_id: userId,
                user_email: userEmail.trim().toLowerCase(),
                persona_id: personaId,
                sgi_annual: row.sgiAnnual ?? 0,
                full_time_gross: row.fullTimeGross ?? 0,
                work_params: row.workParams ?? DEFAULT_WORK_PARAMS,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id,persona_id" },
            );
            return latest;
          });
        }, 600);

        return next;
      });
    },
    [userId, userEmail],
  );

  return { settings, loading, upsert };
}
