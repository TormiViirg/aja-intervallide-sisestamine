import i18next, { type i18n as I18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './en';
import { et } from './et';
import { ru, ruPluralExtras } from './ru';

export const LANGUAGES = ['et', 'en', 'ru'] as const;
export type Language = (typeof LANGUAGES)[number];

export const isLanguage = (v: string | null | undefined): v is Language =>
  !!v && (LANGUAGES as readonly string[]).includes(v);

function deepMerge<T extends object>(base: T, extra: object): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(extra)) {
    const cur = out[k];
    out[k] = cur && typeof cur === 'object' && typeof v === 'object' ? deepMerge(cur as object, v as object) : v;
  }
  return out as T;
}

export const resources = {
  et: { translation: et },
  en: { translation: en },
  ru: { translation: deepMerge(ru, ruPluralExtras) },
};

export function createI18n(lng: Language = 'et'): I18n {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: 'et',
    interpolation: { escapeValue: false },
    initAsync: false,
  });
  return instance;
}

/** BCP-47 locales for Intl APIs and the calendar. */
export const INTL_LOCALE: Record<Language, string> = { et: 'et-EE', en: 'en-GB', ru: 'ru-RU' };
