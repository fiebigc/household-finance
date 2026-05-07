import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en.json";
import fi from "@/locales/fi.json";
import de from "@/locales/de.json";
import sv from "@/locales/sv.json";
import cardsEn from "@/locales/cards-en.json";
import cardsFi from "@/locales/cards-fi.json";
import cardsDe from "@/locales/cards-de.json";
import cardsSv from "@/locales/cards-sv.json";
import { notifyPreferencesPersistNeeded } from "@/stores/cardValuesStore";

export const LANG_STORAGE_KEY = "fin:locale";
export type AppLocale = "en" | "fi" | "de" | "sv";

const SUPPORTED = new Set<string>(["en", "fi", "de", "sv"]);

export function readStoredLocale(): AppLocale {
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(LANG_STORAGE_KEY) : null;
    if (v && SUPPORTED.has(v)) return v as AppLocale;
  } catch {
    /* ignore */
  }
  return "en";
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: { ...en, cards: cardsEn } },
    fi: { translation: { ...fi, cards: cardsFi } },
    de: { translation: { ...de, cards: cardsDe } },
    sv: { translation: { ...sv, cards: cardsSv } },
  },
  lng: readStoredLocale(),
  fallbackLng: "en",
  supportedLngs: ["en", "fi", "de", "sv"],
  interpolation: { escapeValue: false },
});

if (typeof document !== "undefined") {
  document.documentElement.lang = readStoredLocale();
}

export function setAppLocale(lng: AppLocale, opts?: { skipPreferencesPersist?: boolean }): void {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lng);
  } catch {
    /* ignore */
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = lng;
  }
  void i18n.changeLanguage(lng);
  if (!opts?.skipPreferencesPersist) notifyPreferencesPersistNeeded();
}

export { i18n };
