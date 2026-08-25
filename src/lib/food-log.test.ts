import { describe, expect, it } from "vitest";
import {
  aggregateDailyNutrition,
  groupRecentFoods,
  isDayInTarget,
  isQuickAddServing,
  netRemaining,
  nutritionInsights,
  scaleLoggedMacros,
  toCopiedInserts,
} from "./food-log";

const yogurt = {
  serving_size_g: 150,
  calories: 90,
  protein: 15,
  carbs: 6,
  fat: 0.3,
};

describe("scaleLoggedMacros", () => {
  it("scales a logged portion linearly", () => {
    expect(scaleLoggedMacros(yogurt, 300)).toEqual({
      serving_size_g: 300,
      calories: 180,
      protein: 30,
      carbs: 12,
      fat: 0.6,
    });
  });

  it("does not scale quick-add rows (0 g)", () => {
    expect(
      scaleLoggedMacros({ serving_size_g: 0, calories: 250, protein: 10, carbs: 20, fat: 8 }, 100),
    ).toEqual({
      serving_size_g: 0,
      calories: 250,
      protein: 10,
      carbs: 20,
      fat: 8,
    });
  });

  it("keeps the original row when the new amount is invalid", () => {
    expect(scaleLoggedMacros(yogurt, 0)).toEqual(yogurt);
    expect(scaleLoggedMacros(yogurt, Number.NaN)).toEqual(yogurt);
  });
});

describe("toCopiedInserts", () => {
  it("copies rows onto a new date without ids", () => {
    expect(
      toCopiedInserts(
        [
          {
            user_id: "u1",
            meal_type: "breakfast",
            food_name: "Skyr",
            brand: "Arla",
            ...yogurt,
          },
        ],
        "2026-08-25",
      ),
    ).toEqual([
      {
        user_id: "u1",
        date: "2026-08-25",
        meal_type: "breakfast",
        food_name: "Skyr",
        brand: "Arla",
        ...yogurt,
      },
    ]);
  });
});

describe("netRemaining", () => {
  it("adds exercise on top of the calorie target", () => {
    expect(netRemaining({ target: 1800, food: 1500, exercise: 200 })).toBe(500);
  });
});

describe("isQuickAddServing", () => {
  it("treats 0 and negative grams as quick-add", () => {
    expect(isQuickAddServing(0)).toBe(true);
    expect(isQuickAddServing(100)).toBe(false);
  });
});

describe("groupRecentFoods", () => {
  it("groups by name, brand and per-100 g calories and keeps the latest serving", () => {
    const recents = groupRecentFoods(
      [
        {
          food_name: "Skyr",
          brand: "Arla",
          date: "2026-08-20",
          created_at: "2026-08-20T08:00:00Z",
          serving_size_g: 100,
          calories: 60,
          protein: 10,
          carbs: 4,
          fat: 0.2,
        },
        {
          food_name: "Skyr",
          brand: "Arla",
          date: "2026-08-24",
          created_at: "2026-08-24T08:00:00Z",
          serving_size_g: 150,
          calories: 90,
          protein: 15,
          carbs: 6,
          fat: 0.3,
        },
        {
          food_name: "Banane",
          brand: null,
          date: "2026-08-24",
          serving_size_g: 120,
          calories: 107,
          protein: 1.3,
          carbs: 27,
          fat: 0.4,
        },
        {
          food_name: "Schnell erfasst",
          brand: null,
          date: "2026-08-24",
          serving_size_g: 0,
          calories: 300,
          protein: 0,
          carbs: 0,
          fat: 0,
        },
        {
          food_name: "Alt",
          brand: null,
          date: "2026-08-01",
          serving_size_g: 100,
          calories: 100,
          protein: 1,
          carbs: 1,
          fat: 1,
        },
      ],
      { today: "2026-08-25", days: 14, limit: 20 },
    );

    expect(recents).toHaveLength(2);
    expect(recents[0]).toMatchObject({
      name: "Skyr",
      brand: "Arla",
      servingSizeG: 150,
      count: 2,
      lastDate: "2026-08-24",
    });
    expect(recents[1]?.name).toBe("Banane");
  });
});

describe("aggregateDailyNutrition + nutritionInsights", () => {
  const days = aggregateDailyNutrition(
    [
      {
        date: "2026-08-23",
        calories: 1800,
        protein: 120,
        carbs: 180,
        fat: 50,
      },
      {
        date: "2026-08-24",
        calories: 2000,
        protein: 130,
        carbs: 200,
        fat: 55,
      },
      {
        date: "2026-08-25",
        calories: 1850,
        protein: 125,
        carbs: 190,
        fat: 52,
      },
    ],
    [{ date: "2026-08-25", calories: 50 }],
    "2026-08-23",
    "2026-08-25",
  );

  it("fills every calendar day in the range", () => {
    expect(days.map((d) => d.date)).toEqual(["2026-08-23", "2026-08-24", "2026-08-25"]);
    expect(days[2]?.exercise).toBe(50);
    expect(days[2]?.hasFood).toBe(true);
  });

  it("counts a day in target within ±10% of target + exercise", () => {
    expect(isDayInTarget(days[0]!, 1800)).toBe(true);
    expect(isDayInTarget({ calories: 2500, exercise: 0, hasFood: true }, 1800)).toBe(false);
    expect(isDayInTarget({ calories: 0, exercise: 0, hasFood: false }, 1800)).toBe(false);
  });

  it("computes averages, in-target days and a trailing streak", () => {
    const insights = nutritionInsights(days, 1800);
    expect(insights.loggedDays).toBe(3);
    expect(insights.avgCalories).toBe(1883);
    expect(insights.avgProtein).toBe(125);
    expect(insights.daysInTarget).toBe(2);
    expect(insights.streak).toBe(1);
  });
});
