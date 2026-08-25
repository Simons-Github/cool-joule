import { describe, expect, it } from "vitest";
import {
  FOOD_PHOTO_TIMEOUT_MESSAGE,
  FoodPhotoError,
  MAX_IMAGE_EDGE,
  estimateBase64Bytes,
  fitWithinMax,
  foodPhotoAnalysisSchema,
  getFoodPhotoErrorMessage,
  isFoodPhotoTimeoutError,
  mapAnalyzedItem,
  mapAnalyzedItems,
  scaleMacros,
  toPhotoDrafts,
  validateImagePayload,
} from "./food-photo-analysis";

describe("estimateBase64Bytes", () => {
  it("accounts for padding", () => {
    expect(estimateBase64Bytes("QQ==")).toBe(1);
    expect(estimateBase64Bytes("QUI=")).toBe(2);
    expect(estimateBase64Bytes("QUJD")).toBe(3);
  });
});

describe("validateImagePayload", () => {
  it("accepts jpeg/png/webp under the size limit", () => {
    expect(() => validateImagePayload("image/jpeg", "QUJD")).not.toThrow();
    expect(() => validateImagePayload("image/png", "QUJD")).not.toThrow();
    expect(() => validateImagePayload("image/webp", "QUJD")).not.toThrow();
  });

  it("rejects empty payloads", () => {
    expect(() => validateImagePayload("image/jpeg", "   ")).toThrow(FoodPhotoError);
    try {
      validateImagePayload("image/jpeg", "");
    } catch (error) {
      expect(error).toBeInstanceOf(FoodPhotoError);
      expect((error as FoodPhotoError).code).toBe("INVALID_IMAGE");
    }
  });

  it("rejects unsupported mime types", () => {
    try {
      validateImagePayload("image/gif", "QUJD");
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(FoodPhotoError);
      expect((error as FoodPhotoError).code).toBe("UNSUPPORTED_TYPE");
    }
  });

  it("rejects oversized base64", () => {
    const oversized = "A".repeat(3_000_000);
    try {
      validateImagePayload("image/jpeg", oversized);
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(FoodPhotoError);
      expect((error as FoodPhotoError).code).toBe("TOO_LARGE");
    }
  });
});

describe("mapAnalyzedItem", () => {
  it("maps a valid item and defaults confidence", () => {
    expect(
      mapAnalyzedItem({
        name: "  Hähnchenbrust  ",
        estimatedGrams: 150.4,
        kcal100: 165,
        protein100: 31,
        carbs100: 0,
        fat100: 3.6,
      }),
    ).toEqual({
      name: "Hähnchenbrust",
      estimatedGrams: 150,
      kcal100: 165,
      protein100: 31,
      carbs100: 0,
      fat100: 3.6,
      confidence: "medium",
    });
  });

  it("clamps negative values and skips empty names or zero grams", () => {
    expect(
      mapAnalyzedItem({
        name: "Reis",
        estimatedGrams: -20,
        kcal100: -10,
        protein100: -1,
        carbs100: 28,
        fat100: 0.3,
        confidence: "high",
      }),
    ).toBeNull();

    expect(
      mapAnalyzedItem({
        name: "   ",
        estimatedGrams: 100,
        kcal100: 100,
        protein100: 1,
        carbs100: 20,
        fat100: 1,
      }),
    ).toBeNull();
  });

  it("accepts items without macros so OFF can fill them", () => {
    expect(
      mapAnalyzedItem({
        name: "Reis",
        estimatedGrams: 200,
      }),
    ).toEqual({
      name: "Reis",
      estimatedGrams: 200,
      kcal100: 0,
      protein100: 0,
      carbs100: 0,
      fat100: 0,
      confidence: "medium",
    });
  });

  it("clamps negative macros when grams are valid", () => {
    expect(
      mapAnalyzedItem({
        name: "Salat",
        estimatedGrams: 80,
        kcal100: -12,
        protein100: Number.NaN,
        carbs100: 3,
        fat100: 0.2,
        confidence: "low",
      }),
    ).toEqual({
      name: "Salat",
      estimatedGrams: 80,
      kcal100: 0,
      protein100: 0,
      carbs100: 3,
      fat100: 0.2,
      confidence: "low",
    });
  });
});

describe("mapAnalyzedItems", () => {
  it("drops invalid rows and keeps valid ones", () => {
    expect(
      mapAnalyzedItems([
        {
          name: "",
          estimatedGrams: 100,
          kcal100: 50,
          protein100: 1,
          carbs100: 10,
          fat100: 1,
        },
        {
          name: "Reis",
          estimatedGrams: 200,
          kcal100: 130,
          protein100: 2.7,
          carbs100: 28,
          fat100: 0.3,
          confidence: "high",
        },
      ]),
    ).toEqual([
      {
        name: "Reis",
        estimatedGrams: 200,
        kcal100: 130,
        protein100: 2.7,
        carbs100: 28,
        fat100: 0.3,
        confidence: "high",
      },
    ]);
  });

  it("returns an empty array when nothing is edible", () => {
    expect(mapAnalyzedItems([])).toEqual([]);
  });
});

describe("toPhotoDrafts", () => {
  it("selects every item and copies estimated grams", () => {
    expect(
      toPhotoDrafts([
        {
          name: "Reis",
          estimatedGrams: 200,
          kcal100: 130,
          protein100: 2.7,
          carbs100: 28,
          fat100: 0.3,
          confidence: "high",
        },
      ]),
    ).toEqual([
      {
        name: "Reis",
        estimatedGrams: 200,
        kcal100: 130,
        protein100: 2.7,
        carbs100: 28,
        fat100: 0.3,
        confidence: "high",
        id: "Reis-0",
        selected: true,
        grams: "200",
      },
    ]);
  });
});

describe("scaleMacros", () => {
  it("scales per-100g values to the serving", () => {
    expect(scaleMacros({ kcal100: 165, protein100: 31, carbs100: 0, fat100: 3.6 }, 150)).toEqual({
      calories: 248,
      protein: 46.5,
      carbs: 0,
      fat: 5.4,
    });
  });

  it("treats invalid grams as zero", () => {
    expect(
      scaleMacros({ kcal100: 100, protein100: 10, carbs100: 10, fat100: 10 }, Number.NaN),
    ).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });
});

describe("fitWithinMax", () => {
  it("keeps images already within the max edge", () => {
    expect(fitWithinMax(800, 600, 1280)).toEqual({ width: 800, height: 600 });
  });

  it("scales the longest edge down", () => {
    expect(fitWithinMax(2560, 1920, MAX_IMAGE_EDGE)).toEqual({ width: 768, height: 576 });
  });
});

describe("foodPhotoAnalysisSchema", () => {
  it("rejects oversized item lists and names", () => {
    expect(() =>
      foodPhotoAnalysisSchema.parse({
        items: Array.from({ length: 13 }, () => ({
          name: "Reis",
          estimatedGrams: 100,
          kcal100: 130,
          protein100: 2,
          carbs100: 28,
          fat100: 0.3,
        })),
      }),
    ).toThrow();

    expect(() =>
      foodPhotoAnalysisSchema.parse({
        items: [
          {
            name: "x".repeat(121),
            estimatedGrams: 100,
            kcal100: 130,
            protein100: 2,
            carbs100: 28,
            fat100: 0.3,
          },
        ],
      }),
    ).toThrow();
  });
});

describe("getFoodPhotoErrorMessage", () => {
  it("prefers FoodPhotoError and Error messages", () => {
    expect(getFoodPhotoErrorMessage(new FoodPhotoError("NO_FOOD", "Kein Essen erkennbar."))).toBe(
      "Kein Essen erkennbar.",
    );
    expect(
      getFoodPhotoErrorMessage(
        new FoodPhotoError("RATE_LIMITED", "Nur 1 Fotoanalyse pro 24 Stunden."),
      ),
    ).toBe("Nur 1 Fotoanalyse pro 24 Stunden.");
    expect(getFoodPhotoErrorMessage(new Error("Netzwerk weg"))).toBe("Netzwerk weg");
    expect(getFoodPhotoErrorMessage("nope")).toBe(
      "Die Analyse ist fehlgeschlagen. Bitte erneut versuchen.",
    );
    const timeout = Object.assign(new Error("The operation was aborted"), { name: "TimeoutError" });
    expect(isFoodPhotoTimeoutError(timeout)).toBe(true);
    expect(getFoodPhotoErrorMessage(timeout)).toBe(FOOD_PHOTO_TIMEOUT_MESSAGE);
  });
});
