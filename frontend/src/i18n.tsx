import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { fetchTranslations } from "./api";
import { useAuth } from "./auth";
import { useLocation } from "react-router-dom";
import { defaultTranslations } from "@shared/i18n-config";
import { setDayjsLocale } from "./utils/dateFormat";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import dayjs from "dayjs";

type I18nState = {
  lang: string;
  t: (key: string, fallback?: string) => string;
  setLang: (lang: string) => void;
  antdLocale: typeof zhCN;
};

const I18nContext = createContext<I18nState | null>(null);
const LANG_STORAGE_KEY = "lang";

export function I18nProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user } = useAuth();
  const [lang, setLang] = useState<string>(() => {
    return localStorage.getItem(LANG_STORAGE_KEY) || "zh-CN";
  });
  const [translations, setTranslations] = useState<Record<string, string>>({});

  useEffect(() => {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
    setDayjsLocale(lang);
  }, [lang]);

  useEffect(() => {
    const page = location.pathname || "/";
    fetchTranslations(lang, page)
      .then((res) => setTranslations(res.translations || {}))
      .catch(() => setTranslations({}));
  }, [lang, location.pathname, user?.id]);

  const t = useMemo(
    () => (key: string, fallback?: string) => {
      return (
        translations[key] ??
        defaultTranslations[lang]?.[key] ??
        fallback ??
        key
      );
    },
    [translations, lang]
  );

  const antdLocale = lang === "zh-CN" ? zhCN : enUS;

  const value: I18nState = {
    lang,
    t,
    setLang,
    antdLocale
  };

  return (
    <ConfigProvider locale={antdLocale}>
      <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
    </ConfigProvider>
  );
}

export function useI18n(): I18nState {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}

