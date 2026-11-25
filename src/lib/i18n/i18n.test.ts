import { describe, expect, it } from "vitest";
import {
  DEFAULT_LANG,
  LANG_COOKIE,
  createT,
  interpolate,
  localeFor,
  parseLang,
  readLangFromCookie,
  serializeLangCookie,
  translate,
  translatePlural,
} from "./index";
import { de } from "./de";
import { en } from "./en";

describe("parseLang", () => {
  it("accepts supported languages", () => {
    expect(parseLang("de")).toBe("de");
    expect(parseLang("en")).toBe("en");
  });

  it("falls back to German for anything else", () => {
    for (const value of ["fr", "EN", "", " en", null, undefined, 1, {}]) {
      expect(parseLang(value)).toBe("de");
    }
    expect(DEFAULT_LANG).toBe("de");
  });
});

describe("language cookie", () => {
  it("reads the lang cookie out of a Cookie header", () => {
    expect(readLangFromCookie("a=1; lang=en; b=2")).toBe("en");
    expect(readLangFromCookie("lang=de")).toBe("de");
  });

  it("defaults to German when missing or invalid", () => {
    expect(readLangFromCookie(undefined)).toBe("de");
    expect(readLangFromCookie("")).toBe("de");
    expect(readLangFromCookie("theme=dark")).toBe("de");
    expect(readLangFromCookie("lang=xx")).toBe("de");
  });

  it("serializes a long-lived, site-wide cookie", () => {
    const cookie = serializeLangCookie("en");
    expect(cookie.startsWith(`${LANG_COOKIE}=en;`)).toBe(true);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
  });
});

describe("dictionaries", () => {
  it("English defines exactly the keys of German", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort());
  });

  it("uses the same {placeholders} in both languages", () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(de) as (keyof typeof de)[]) {
      expect(placeholders(en[key]), key).toEqual(placeholders(de[key]));
    }
  });

  it("has no empty strings", () => {
    for (const [key, value] of [...Object.entries(de), ...Object.entries(en)]) {
      expect(value.trim().length, key).toBeGreaterThan(0);
    }
  });

  it("has _one and _other for every plural key", () => {
    for (const key of Object.keys(de)) {
      if (key.endsWith("_one")) expect(de).toHaveProperty(key.replace(/_one$/, "_other"));
    }
  });
});

describe("interpolate", () => {
  it("replaces {name} placeholders", () => {
    expect(interpolate("Hi {name}, {n} left", { name: "Ana", n: 3 })).toBe("Hi Ana, 3 left");
  });

  it("leaves unknown placeholders and plain text untouched", () => {
    expect(interpolate("Hi {name}", {})).toBe("Hi {name}");
    expect(interpolate("no vars")).toBe("no vars");
  });

  it("works through translate()", () => {
    expect(translate("de", "onb.title", { app: "Joule" })).toBe("Willkommen bei Joule");
    expect(translate("en", "onb.title", { app: "Joule" })).toBe("Welcome to Joule");
    expect(createT("en")("password.tooShort", { min: 10 })).toContain("10");
  });
});

describe("plurals", () => {
  it("picks the singular and plural form", () => {
    expect(translatePlural("de", "strava.imported", 1)).toBe("1 Workout importiert");
    expect(translatePlural("de", "strava.imported", 3)).toBe("3 Workouts importiert");
    expect(translatePlural("en", "strava.imported", 1)).toBe("1 workout imported");
    expect(translatePlural("en", "strava.imported", 0)).toBe("0 workouts imported");
  });
});

describe("localeFor", () => {
  it("maps languages to Intl locales", () => {
    expect(localeFor("de")).toBe("de-DE");
    expect(localeFor("en")).toBe("en-GB");
  });
});
