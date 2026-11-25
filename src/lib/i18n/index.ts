import { de } from "./de";
import { en } from "./en";

export const LANGS = ["de", "en"] as const;
export type Lang = (typeof LANGS)[number];

/** German is the source language and the default. There is no auto-detection. */
export const DEFAULT_LANG: Lang = "de";
export const LANG_COOKIE = "lang";
const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type MessageKey = keyof typeof de;
export type MessageVars = Record<string, string | number>;

/** Keys that have `_one` and `_other` variants, without the suffix. */
export type PluralKey = {
  [K in MessageKey]: K extends `${infer Base}_other` ? Base : never;
}[MessageKey];

const dictionaries: Record<Lang, Record<string, string>> = { de, en };

export const LOCALES: Record<Lang, string> = { de: "de-DE", en: "en-GB" };

export function localeFor(lang: Lang): string {
  return LOCALES[lang];
}

/** Anything that is not a supported language falls back to German. */
export function parseLang(value: unknown): Lang {
  return value === "en" || value === "de" ? value : DEFAULT_LANG;
}

export function interpolate(template: string, vars?: MessageVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

export function translate(lang: Lang, key: MessageKey, vars?: MessageVars): string {
  const template = dictionaries[lang][key] ?? de[key];
  return interpolate(template, vars);
}

/** Picks `${key}_one` / `${key}_other` via Intl.PluralRules and fills `{count}`. */
export function translatePlural(
  lang: Lang,
  key: PluralKey,
  count: number,
  vars?: MessageVars,
): string {
  const category = new Intl.PluralRules(localeFor(lang)).select(count);
  const specific = `${key}_${category}` as MessageKey;
  const resolved = specific in de ? specific : (`${key}_other` as MessageKey);
  return translate(lang, resolved, { count, ...vars });
}

export type TFunction = (key: MessageKey, vars?: MessageVars) => string;
export type TPluralFunction = (key: PluralKey, count: number, vars?: MessageVars) => string;

export function createT(lang: Lang): TFunction {
  return (key, vars) => translate(lang, key, vars);
}

export function createTPlural(lang: Lang): TPluralFunction {
  return (key, count, vars) => translatePlural(lang, key, count, vars);
}

/** Reads `lang=` out of a Cookie header / `document.cookie` string. */
export function readLangFromCookie(cookieHeader: string | null | undefined): Lang {
  if (!cookieHeader) return DEFAULT_LANG;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === LANG_COOKIE) return parseLang(rest.join("="));
  }
  return DEFAULT_LANG;
}

export function serializeLangCookie(lang: Lang): string {
  return `${LANG_COOKIE}=${lang}; Path=/; Max-Age=${LANG_COOKIE_MAX_AGE}; SameSite=Lax`;
}
