import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en.json";
import fi from "@/locales/fi.json";
import de from "@/locales/de.json";
import cardsEn from "@/locales/cards-en.json";
import cardsFi from "@/locales/cards-fi.json";
import cardsDe from "@/locales/cards-de.json";

export const LANG_STORAGE_KEY = "fin:locale";
export type AppLocale = "en" | "fi" | "de";

export function readStoredLocale(): AppLocale {
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(LANG_STORAGE_KEY) : null;
    if (v === "fi" || v === "de" || v === "en") return v;
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
  },
  lng: readStoredLocale(),
  fallbackLng: "en",
  supportedLngs: ["en", "fi", "de"],
  interpolation: { escapeValue: false },
});

if (typeof document !== "undefined") {
  document.documentElement.lang = readStoredLocale();
}

export function setAppLocale(lng: AppLocale): void {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lng);
  } catch {
    /* ignore */
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = lng;
  }
  void i18n.changeLanguage(lng);
}

export { i18n };
