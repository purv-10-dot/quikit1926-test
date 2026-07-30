'use client';
/**
 * Lightweight i18n provider preserving the 7 existing locales (en, hi, ta, te,
 * kn, mr, bn) and their JSON dictionaries. Language is persisted in a cookie
 * (server-readable for SSR) with a localStorage fallback. Mirrors the i18next
 * `t('a.b.c')` dot-path lookup. (Can be swapped for next-intl later without
 * touching call sites.)
 */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import en from '@/messages/en.json';
import hi from '@/messages/hi.json';
import ta from '@/messages/ta.json';
import te from '@/messages/te.json';
import kn from '@/messages/kn.json';
import mr from '@/messages/mr.json';
import bn from '@/messages/bn.json';

export const LOCALES = ['en', 'hi', 'ta', 'te', 'kn', 'mr', 'bn'] as const;
export type Locale = (typeof LOCALES)[number];

const DICTS: Record<Locale, Record<string, unknown>> = { en, hi, ta, te, kn, mr, bn };

function lookup(dict: Record<string, unknown>, key: string): string | undefined {
  return key.split('.').reduce<unknown>((acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined), dict) as string | undefined;
}

interface I18nCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, fallback?: string) => string;
}

const Ctx = createContext<I18nCtx>({ locale: 'en', setLocale: () => {}, t: (k) => k });
export const useI18n = () => useContext(Ctx);
export const useTranslation = () => { const { t, locale, setLocale } = useI18n(); return { t, locale, setLocale }; };

export function I18nProvider({ children, initialLocale = 'en' }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    const stored = (localStorage.getItem('language') as Locale) || undefined;
    if (stored && LOCALES.includes(stored)) setLocaleState(stored);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem('language', l);
    document.cookie = `language=${l}; path=/; max-age=31536000`;
  }, []);

  const t = useCallback(
    (key: string, fallback?: string) => lookup(DICTS[locale], key) ?? lookup(DICTS.en, key) ?? fallback ?? key,
    [locale],
  );

  return <Ctx.Provider value={{ locale, setLocale, t }}>{children}</Ctx.Provider>;
}
