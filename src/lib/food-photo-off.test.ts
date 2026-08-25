import { describe, expect, it, vi } from "vitest";
import type { AnalyzedFoodItem } from "./food-photo-analysis";
import {
  enrichPhotoItemsWithOff,
  isClearOffNameMatch,
  mergeOffNutrition,
  pickClearOffMatch,
} from "./food-photo-off";
import type { FoodItem } from "./open-food-facts";

const reis: AnalyzedFoodItem = {
  name: "Reis",
  estimatedGrams: 200,
  kcal100: 111,
  protein100: 2.5,
  carbs100: 25,
  fat100: 0.4,
  confidence: "high",
};

const offReis: FoodItem = {
  name: "Reis, gekocht",
  brand: null,
  kcal100: 130,
  protein100: 2.7,
  carbs100: 28,
  fat100: 0.3,
  barcode: "123",
};

describe("isClearOffNameMatch", () => {
  it("accepts exact, prefix, and contained names", () => {
    expect(isClearOffNameMatch("Reis", "Reis")).toBe(true);
    expect(isClearOffNameMatch("Reis", "Reis, gekocht")).toBe(true);
    expect(isClearOffNameMatch("Hähnchenbrust", "Hähnchenbrustfilet")).toBe(true);
    expect(isClearOffNameMatch("Basmati Reis", "Reis")).toBe(true);
  });

  it("rejects weak or short overlaps", () => {
    expect(isClearOffNameMatch("Ei", "Protein Riegel")).toBe(false);
    expect(isClearOffNameMatch("Salat", "Schokolade")).toBe(false);
  });

  it("accepts a brand that contains a long query", () => {
    expect(isClearOffNameMatch("Milka", "Alpenmilch", "Milka")).toBe(true);
  });
});

describe("pickClearOffMatch", () => {
  it("skips a first hit without a clear name match", () => {
    expect(
      pickClearOffMatch("Reis", [
        { name: "Schokolade", brand: null, kcal100: 500, protein100: 5, carbs100: 50, fat100: 30 },
        offReis,
      ]),
    ).toEqual(offReis);
  });

  it("returns null when nothing overlaps", () => {
    expect(
      pickClearOffMatch("Reis", [
        { name: "Schokolade", brand: null, kcal100: 500, protein100: 5, carbs100: 50, fat100: 30 },
      ]),
    ).toBeNull();
  });
});

describe("mergeOffNutrition", () => {
  it("overwrites macros from an OFF hit and keeps the Gemini name", () => {
    expect(mergeOffNutrition(reis, offReis)).toEqual({
      ...reis,
      kcal100: 130,
      protein100: 2.7,
      carbs100: 28,
      fat100: 0.3,
    });
  });

  it("keeps Gemini macros and marks confidence low without a hit", () => {
    expect(mergeOffNutrition(reis, null)).toEqual({ ...reis, confidence: "low" });
  });
});

describe("enrichPhotoItemsWithOff", () => {
  it("uses OFF macros on a clear match", async () => {
    const search = vi.fn().mockResolvedValue([offReis]);
    await expect(enrichPhotoItemsWithOff([reis], { search })).resolves.toEqual([
      {
        ...reis,
        kcal100: 130,
        protein100: 2.7,
        carbs100: 28,
        fat100: 0.3,
      },
    ]);
    expect(search).toHaveBeenCalledWith("Reis", expect.objectContaining({ pageSize: 8 }));
  });

  it("keeps Gemini macros when the name does not match", async () => {
    const search = vi
      .fn()
      .mockResolvedValue([
        { name: "Schokolade", brand: null, kcal100: 500, protein100: 5, carbs100: 50, fat100: 30 },
      ]);
    await expect(enrichPhotoItemsWithOff([reis], { search })).resolves.toEqual([
      { ...reis, confidence: "low" },
    ]);
  });

  it("falls back to Gemini macros when search fails", async () => {
    const search = vi.fn().mockRejectedValue(new Error("network"));
    await expect(enrichPhotoItemsWithOff([reis], { search })).resolves.toEqual([
      { ...reis, confidence: "low" },
    ]);
  });
});
