import { describe, expect, it, vi } from "vitest";
import {
  OpenFoodFactsError,
  buildProductUrl,
  buildSearchUrl,
  getOpenFoodFactsErrorMessage,
  kcalFromNutriments,
  lookupProductByBarcode,
  mapAndRankSearchHits,
  mapOffProductToFoodItem,
  mapOffProducts,
  normalizeBarcode,
  normalizeBrands,
  offProductName,
  parseNutrientValue,
  scoreSearchHit,
  searchProducts,
} from "./open-food-facts";
import { APP_NAME } from "./app-config";

describe("parseNutrientValue", () => {
  it("parses numbers and numeric strings", () => {
    expect(parseNutrientValue(12.5)).toBe(12.5);
    expect(parseNutrientValue("8.2")).toBe(8.2);
  });

  it("returns 0 for invalid values", () => {
    expect(parseNutrientValue(undefined)).toBe(0);
    expect(parseNutrientValue("abc")).toBe(0);
    expect(parseNutrientValue(-5)).toBe(0);
  });
});

describe("kcalFromNutriments", () => {
  it("prefers energy-kcal_100g", () => {
    expect(kcalFromNutriments({ "energy-kcal_100g": 250, energy_100g: 1000 })).toBe(250);
  });

  it("converts kJ from energy_100g when kcal is missing", () => {
    expect(kcalFromNutriments({ energy_100g: 418.4 })).toBe(100);
  });

  it("falls back to energy-kcal without _100g suffix", () => {
    expect(kcalFromNutriments({ "energy-kcal": 57 })).toBe(57);
  });
});

describe("mapOffProductToFoodItem", () => {
  it("maps a valid product", () => {
    const item = mapOffProductToFoodItem({
      product_name: "Haferflocken",
      brands: "Testmarke",
      nutriments: {
        "energy-kcal_100g": 370,
        proteins_100g: 13,
        carbohydrates_100g: 60,
        fat_100g: 7,
      },
    });

    expect(item).toEqual({
      name: "Haferflocken",
      brand: "Testmarke",
      kcal100: 370,
      protein100: 13,
      carbs100: 60,
      fat100: 7,
    });
  });

  it("returns null when kcal is missing", () => {
    expect(
      mapOffProductToFoodItem({
        product_name: "Unbekannt",
        nutriments: { proteins_100g: 5 },
      }),
    ).toBeNull();
  });

  it("falls back to German product name", () => {
    const item = mapOffProductToFoodItem({
      product_name_de: "Vollmilch",
      nutriments: { "energy-kcal_100g": 64 },
    });
    expect(item?.name).toBe("Vollmilch");
  });

  it("normalizes brand arrays and keeps the barcode", () => {
    const item = mapOffProductToFoodItem({
      code: "4012345678901",
      product_name: "Skyr",
      brands: [" Arla ", "Milsani"],
      nutriments: { "energy-kcal_100g": 57 },
    });
    expect(item?.brand).toBe("Arla, Milsani");
    expect(item?.barcode).toBe("4012345678901");
  });

  it("picks the localized name that matches the query", () => {
    const item = mapOffProductToFoodItem(
      {
        product_name: "Compote",
        product_name_en: "Skyr Pur",
        nutriments: { "energy-kcal_100g": 65 },
      },
      undefined,
      "Skyr",
    );
    expect(item?.name).toBe("Skyr Pur");
  });
});

describe("mapOffProducts", () => {
  it("filters invalid products", () => {
    const items = mapOffProducts([
      {
        product_name: "Gültig",
        nutriments: { "energy-kcal_100g": 100 },
      },
      { product_name: "Ohne Nährwerte" },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe("Gültig");
  });
});

describe("normalizeBrands", () => {
  it("joins and trims brand arrays", () => {
    expect(normalizeBrands([" Skyr ", "Arla"])).toBe("Skyr, Arla");
  });

  it("returns null for empty values", () => {
    expect(normalizeBrands([])).toBeNull();
    expect(normalizeBrands("  ")).toBeNull();
    expect(normalizeBrands(undefined)).toBeNull();
  });
});

describe("buildSearchUrl", () => {
  it("uses Search-a-licious with German language fields", () => {
    const url = buildSearchUrl("hafer milch");
    expect(url).toContain("search.openfoodfacts.org/search");
    expect(url).toContain("q=hafer+milch");
    expect(url).toContain("langs=de%2Cen");
    expect(url).not.toContain("cgi/search.pl");
  });
});

describe("normalizeBarcode", () => {
  it("strips non-digits", () => {
    expect(normalizeBarcode("4008-4004-0222-4")).toBe("4008400402224");
  });

  it("returns null for invalid lengths", () => {
    expect(normalizeBarcode("123")).toBeNull();
    expect(normalizeBarcode("")).toBeNull();
  });
});

describe("buildProductUrl", () => {
  it("builds v2 product endpoint", () => {
    expect(buildProductUrl("3017624010701")).toContain("/api/v2/product/3017624010701");
  });
});

describe("lookupProductByBarcode", () => {
  it("throws INVALID_BARCODE for bad input", async () => {
    await expect(lookupProductByBarcode("abc")).rejects.toMatchObject({ code: "INVALID_BARCODE" });
  });

  it("throws NOT_FOUND when status is 0", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 0, status_verbose: "product not found" }),
    });
    await expect(lookupProductByBarcode("4008400402224", { fetch: fetchFn })).rejects.toMatchObject(
      {
        code: "NOT_FOUND",
      },
    );
  });

  it("throws INCOMPLETE_PRODUCT when nutriments missing", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 1,
        code: "4008400402224",
        product: { product_name: "Test" },
      }),
    });
    await expect(lookupProductByBarcode("4008400402224", { fetch: fetchFn })).rejects.toMatchObject(
      {
        code: "INCOMPLETE_PRODUCT",
      },
    );
  });

  it("returns mapped product on success", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 1,
        code: "3017624010701",
        product: {
          product_name: "Nutella",
          brands: "Ferrero",
          nutriments: {
            "energy-kcal_100g": 539,
            proteins_100g: 6.3,
            carbohydrates_100g: 57.5,
            fat_100g: 30.9,
          },
        },
      }),
    });

    const item = await lookupProductByBarcode("3017624010701", { fetch: fetchFn });
    expect(item.name).toBe("Nutella");
    expect(item.barcode).toBe("3017624010701");
    expect(item.kcal100).toBe(539);
  });
});

describe("offProductName", () => {
  it("prefers the German product name", () => {
    expect(offProductName({ product_name: "Milk", product_name_de: "Milch" })).toBe("Milch");
  });

  it("prefers a candidate that contains the query", () => {
    expect(
      offProductName(
        { product_name: "Compote", product_name_other: ["Skyr Pur"] },
        "skyr",
      ),
    ).toBe("Skyr Pur");
  });
});

describe("mapAndRankSearchHits", () => {
  it("ranks German exact name matches above weaker foreign hits", () => {
    const items = mapAndRankSearchHits(
      [
        {
          code: "1",
          product_name: "Fromage blanc",
          countries_tags: ["en:france"],
          unique_scans_n: 400,
          nutriments: { "energy-kcal_100g": 80 },
        },
        {
          code: "2",
          product_name: "Skyr",
          brands: ["Arla"],
          countries_tags: ["en:germany"],
          unique_scans_n: 8,
          completeness: 0.8,
          nutriments: { "energy-kcal_100g": 57 },
        },
      ],
      "Skyr",
    );

    expect(items[0]?.name).toBe("Skyr");
    expect(items[0]?.brand).toBe("Arla");
  });

  it("dedupes the same barcode", () => {
    const items = mapAndRankSearchHits(
      [
        {
          code: "401",
          product_name: "Skyr",
          nutriments: { "energy-kcal_100g": 57 },
        },
        {
          code: "401",
          product_name: "Skyr Nature",
          nutriments: { "energy-kcal_100g": 57 },
        },
      ],
      "Skyr",
    );
    expect(items).toHaveLength(1);
  });
});

describe("scoreSearchHit", () => {
  it("scores an exact German match higher than a brand-only hit", () => {
    const exact = scoreSearchHit({
      name: "Skyr",
      brand: "Arla",
      query: "Skyr",
      relevanceIndex: 5,
      uniqueScans: 10,
      popularityKey: 0,
      completeness: 0.8,
      countries: ["en:germany"],
    });
    const brandOnly = scoreSearchHit({
      name: "Compote",
      brand: "Skyr",
      query: "Skyr",
      relevanceIndex: 0,
      uniqueScans: 10,
      popularityKey: 0,
      completeness: 0.8,
      countries: ["en:germany"],
    });
    expect(exact).toBeGreaterThan(brandOnly);
  });
});

describe("searchProducts", () => {
  it("throws EMPTY_QUERY for whitespace", async () => {
    await expect(searchProducts("   ")).rejects.toMatchObject({ code: "EMPTY_QUERY" });
  });

  it("throws NETWORK when fetch fails", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(searchProducts("banane", { fetch: fetchFn })).rejects.toMatchObject({
      code: "NETWORK",
    });
  });

  it("rethrows abort errors", async () => {
    const abort = Object.assign(new Error("Aborted"), { name: "AbortError" });
    const fetchFn = vi.fn().mockRejectedValue(abort);
    await expect(searchProducts("banane", { fetch: fetchFn })).rejects.toBe(abort);
  });

  it("throws HTTP on non-ok response", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    await expect(searchProducts("banane", { fetch: fetchFn })).rejects.toMatchObject({
      code: "HTTP",
      status: 503,
    });
  });

  it("returns mapped products on success", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        hits: [
          {
            product_name: "Banane",
            nutriments: { "energy-kcal_100g": 89 },
          },
        ],
      }),
    });

    const items = await searchProducts("banane", { fetch: fetchFn });
    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe("Banane");
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining("search.openfoodfacts.org/search"),
      expect.objectContaining({
        headers: expect.objectContaining({ "User-Agent": expect.stringContaining(APP_NAME) }),
      }),
    );
  });
});

describe("getOpenFoodFactsErrorMessage", () => {
  it("returns message from OpenFoodFactsError", () => {
    const err = new OpenFoodFactsError("HTTP", "Server nicht erreichbar.");
    expect(getOpenFoodFactsErrorMessage(err)).toBe("Server nicht erreichbar.");
  });

  it("uses Error messages so server RPC errors stay readable", () => {
    expect(getOpenFoodFactsErrorMessage(new Error("Bitte anmelden, um zu suchen."))).toBe(
      "Bitte anmelden, um zu suchen.",
    );
    expect(getOpenFoodFactsErrorMessage("unexpected")).toBe(
      "Suche fehlgeschlagen. Bitte erneut versuchen.",
    );
  });
});
