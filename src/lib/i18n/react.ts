import { createContext, useContext } from "react";
import {
  DEFAULT_LANG,
  createT,
  createTPlural,
  localeFor,
  type Lang,
  type TFunction,
  type TPluralFunction,
} from "./index";

export type I18nValue = {
  lang: Lang;
  /** BCP 47 locale for Intl / toLocale*String / react-day-picker. */
  locale: string;
  t: TFunction;
  tp: TPluralFunction;
  setLang: (lang: Lang) => void;
};

export function buildValue(lang: Lang, setLang: (lang: Lang) => void): I18nValue {
  return { lang, locale: localeFor(lang), t: createT(lang), tp: createTPlural(lang), setLang };
}

// Outside a provider (tests, isolated renders) everything is German.
export const I18nContext = createContext<I18nValue>(buildValue(DEFAULT_LANG, () => {}));

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

export function useT(): TFunction {
  return useContext(I18nContext).t;
}
