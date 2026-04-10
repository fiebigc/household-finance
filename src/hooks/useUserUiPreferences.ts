import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Locale } from "@/i18n/I18nContext";
import type { Theme } from "@/theme/ThemeContext";

const TABLE = "user_preferences";

/**
 * When authenticated: load locale/theme from Supabase, then debounce-save on change.
 * When logged out: no-op (ThemeContext / I18nContext keep using localStorage only).
 */
export function useUserUiPreferences(
  userId: string | undefined,
  locale: Locale,
  theme: Theme,
  setLocale: (l: Locale) => void,
  setTheme: (t: Theme) => void,
) {
  const [remoteReady, setRemoteReady] = useState(false);
  const fetchGen = useRef(0);

  useEffect(() => {
    if (!userId) {
      setRemoteReady(false);
      return;
    }

    setRemoteReady(false);
    const id = ++fetchGen.current;
    let cancelled = false;

    void (async () => {
      const { data, error } = await supabase
        .from(TABLE)
        .select("locale, theme")
        .eq("user_id", userId)
        .maybeSingle();

      if (cancelled || fetchGen.current !== id) return;
      if (error) {
        console.error("user_preferences fetch:", error.message);
        setRemoteReady(true);
        return;
      }
      if (data?.theme === "light" || data?.theme === "dark") setTheme(data.theme);
      if (data?.locale === "en" || data?.locale === "de" || data?.locale === "fi") {
        setLocale(data.locale);
      }
      setRemoteReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, setLocale, setTheme]);

  useEffect(() => {
    if (!userId || !remoteReady) return;
    const t = setTimeout(() => {
      void supabase
        .from(TABLE)
        .upsert(
          {
            user_id: userId,
            locale,
            theme,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        )
        .then(({ error }) => {
          if (error) console.error("user_preferences save:", error.message);
        });
    }, 500);
    return () => clearTimeout(t);
  }, [locale, theme, userId, remoteReady]);
}
