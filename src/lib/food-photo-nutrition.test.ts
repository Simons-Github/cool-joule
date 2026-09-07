import { describe, expect, it } from "vitest";
import type { AnalyzedFoodItem } from "./food-photo-analysis";
import {
  isStrictFoodNameMatch,
  pickNutritionMatch,
  resolvePhotoItemNutrition,
  resolvePhotoItemsNutrition,
} from "./food-photo-nutrition";
import type { CatalogFood } from "./food-photo-nutrition";

const reis: AnalyzedFoodItem = {
  name: "Reis",
  estimatedGrams: 200,
  kcal100: 111,
  protein100: 2.5,
  carbs100: 25,
  fat100: 0.4,
  confidence: "high",
  nutritionSource: "model",
};

const recentReis: CatalogFood = {
  name: "Reis, gekocht",
  kcal100: 118,
  protein100: 2.4,
  carbs100: 26,
  fat100: 0.2,
};

const customReis: CatalogFood = {
  name: "Basmati",
  kcal100: 140,
  protein100: 3,
  carbs100: 30,
  fat100: 0.5,
};

describe("isStrictFoodNameMatch", () => {
  it("accepts exact, token-subset, alias, and compound-suffix names", () => {
    expect(isStrictFoodNameMatch("Reis", "Reis")).toBe(true);
    expect(isStrictFoodNameMatch("Reis", "Reis, gekocht")).toBe(true);
    expect(isStrictFoodNameMatch("Hähnchen", "Hähnchenbrust")).toBe(true);
    expect(isStrictFoodNameMatch("Basmati Reis", "Reis")).toBe(true);
    expect(isStrictFoodNameMatch("Hähnchenbrust", "Hähnchenbrustfilet")).toBe(true);
  });

  it("rejects weak substring overlaps", () => {
    expect(isStrictFoodNameMatch("Reis", "Reiswaffeln")).toBe(false);
    expect(isStrictFoodNameMatch("Salat", "Salatdressing")).toBe(false);
    expect(isStrictFoodNameMatch("Ei", "Protein Riegel")).toBe(false);
    expect(isStrictFoodNameMatch("Salat", "Schokolade")).toBe(false);
    expect(isStrictFoodNameMatch("gekocht", "Reis, gekocht")).toBe(false);
  });
});

describe("pickNutritionMatch", () => {
  it("prefers recent over custom over generic", () => {
    expect(
      pickNutritionMatch("Reis", { recent: [recentReis], custom: [customReis] }),
    ).toMatchObject({ source: "recent", kcal100: 118, matchedName: "Reis, gekocht" });

    expect(pickNutritionMatch("Reis", { recent: [], custom: [customReis] })).toMatchObject({
      source: "custom",
      kcal100: 140,
      matchedName: "Basmati",
    });

    expect(pickNutritionMatch("Reis", { recent: [], custom: [] })).toMatchObject({
      source: "generic",
      matchedName: "Reis, gekocht",
      kcal100: 130,
    });
  });

  it("returns null when nothing matches", () => {
    expect(pickNutritionMatch("Drachenfrucht-Bowl", { recent: [], custom: [] })).toBeNull();
  });
});

describe("resolvePhotoItemNutrition", () => {
  it("overwrites macros from a match and keeps Gemini confidence", () => {
    expect(resolvePhotoItemNutrition(reis, { recent: [recentReis], custom: [] })).toEqual({
      ...reis,
      kcal100: 118,
      protein100: 2.4,
      carbs100: 26,
      fat100: 0.2,
      confidence: "high",
      nutritionSource: "recent",
    });
  });

  it("keeps Gemini macros and model source without a match", () => {
    expect(
      resolvePhotoItemNutrition(
        { ...reis, name: "Drachenfrucht-Bowl", confidence: "high" },
        { recent: [], custom: [] },
      ),
    ).toMatchObject({
      name: "Drachenfrucht-Bowl",
      kcal100: 111,
      confidence: "high",
      nutritionSource: "model",
    });
  });
});

describe("resolvePhotoItemsNutrition", () => {
  it("resolves a mixed plate with the expected sources", () => {
    const items: AnalyzedFoodItem[] = [
      reis,
      {
        name: "Mein Skyr",
        estimatedGrams: 150,
        kcal100: 80,
        protein100: 8,
        carbs100: 5,
        fat100: 1,
        confidence: "medium",
        nutritionSource: "model",
      },
      {
        name: "Brokkoli",
        estimatedGrams: 90,
        kcal100: 40,
        protein100: 3,
        carbs100: 6,
        fat100: 0.5,
        confidence: "low",
        nutritionSource: "model",
      },
    ];

    const resolved = resolvePhotoItemsNutrition(items, {
      recent: [recentReis],
      custom: [
        {
          name: "Mein Skyr",
          kcal100: 62,
          protein100: 11,
          carbs100: 4,
          fat100: 0.2,
        },
      ],
    });

    expect(resolved.map((item) => item.nutritionSource)).toEqual(["recent", "custom", "generic"]);
    expect(resolved[2]).toMatchObject({
      name: "Brokkoli",
      kcal100: 35,
      confidence: "low",
      nutritionSource: "generic",
    });
  });
});
