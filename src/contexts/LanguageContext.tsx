/* ─────────────────────────────────────────────────────────────────────────────
 * LanguageContext — Global language + direction state
 *
 * • Persists choice in localStorage ("ome_language")
 * • Applies dir="rtl|ltr" and lang="ar|en" to <html>
 * • Adds data-lang attribute for CSS selectors ([data-lang="en"] { ... })
 * • Calls i18n.changeLanguage() to update all useTranslation() hooks
 * ─────────────────────────────────────────────────────────────────────────── */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import i18n, { type SupportedLang } from "../lib/i18n";

interface LanguageContextValue {
  lang:   SupportedLang;
  dir:    "rtl" | "ltr";
  isRTL:  boolean;
  setLang: (lang: SupportedLang) => void;
  toggle: () => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang:    "ar",
  dir:     "rtl",
  isRTL:   true,
  setLang: () => void 0,
  toggle:  () => void 0,
});

/* ── Provider ────────────────────────────────────────────────────────────── */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<SupportedLang>(
    (localStorage.getItem("ome_language") as SupportedLang | null) ?? "ar",
  );

  const dir   = lang === "ar" ? "rtl" : "ltr";
  const isRTL = lang === "ar";

  /* Apply direction + lang attrs to <html> on every change */
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("dir",       dir);
    html.setAttribute("lang",      lang);
    html.setAttribute("data-lang", lang);
  }, [lang, dir]);

  const setLang = useCallback((l: SupportedLang) => {
    setLangState(l);
    localStorage.setItem("ome_language", l);
    void i18n.changeLanguage(l);
  }, []);

  const toggle = useCallback(() => {
    setLang(lang === "ar" ? "en" : "ar");
  }, [lang, setLang]);

  return (
    <LanguageContext.Provider value={{ lang, dir, isRTL, setLang, toggle }}>
      {children}
    </LanguageContext.Provider>
  );
}

/* ── Hook ────────────────────────────────────────────────────────────────── */
export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
