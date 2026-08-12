import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, calculateTargets, formatGermanDate, fromISO, toISO, todayISO } from "./nutrition";

describe("calculateTargets", () => {
  // Mifflin-St Jeor: BMR = 10w + 6.25h - 5a + (male ? 5 : -161)
  // TDEE = BMR × activity; calories adjust by goal (−500 / 0 / +300), then round.
  // Macros: lose 35/35/30, maintain 25/45/30, gain 30/45/25 (% P/C/F).

  it("computes TDEE and maintain macros for a moderately active male", () => {
    // BMR 1780 → TDEE 1780×1.55 = 2759
    expect(
      calculateTargets({
        gender: "male",
        age: 30,
        heightCm: 180,
        weightKg: 80,
        activity: "moderate",
        goal: "maintain",
      }),
    ).toEqual({ calories: 2759, protein: 172, carbs: 310, fat: 92 });
  });

  it("applies a 500 kcal deficit and lose macro split for a lightly active female", () => {
    // BMR 1345.25 → TDEE 1849.71875 → calories 1350
    expect(
      calculateTargets({
        gender: "female",
        age: 25,
        heightCm: 165,
        weightKg: 60,
        activity: "light",
        goal: "lose",
      }),
    ).toEqual({ calories: 1350, protein: 118, carbs: 118, fat: 45 });
  });

  it("applies a 300 kcal surplus and gain macro split for a sedentary male", () => {
    // BMR 1798.75 → TDEE 2158.5 → calories 2459
    expect(
      calculateTargets({
        gender: "male",
        age: 40,
        heightCm: 175,
        weightKg: 90,
        activity: "sedentary",
        goal: "gain",
      }),
    ).toEqual({ calories: 2459, protein: 184, carbs: 277, fat: 68 });
  });

  it("handles a very active older female on maintain", () => {
    // BMR 1326.5 → TDEE 1326.5×1.725 = 2288.2125 → 2288
    expect(
      calculateTargets({
        gender: "female",
        age: 55,
        heightCm: 170,
        weightKg: 70,
        activity: "very",
        goal: "maintain",
      }),
    ).toEqual({ calories: 2288, protein: 143, carbs: 257, fat: 76 });
  });

  it("combines very-active TDEE with a cut for a younger male", () => {
    // BMR 1771.25 → TDEE 3055.40625 → calories 2555
    expect(
      calculateTargets({
        gender: "male",
        age: 28,
        heightCm: 185,
        weightKg: 75,
        activity: "very",
        goal: "lose",
      }),
    ).toEqual({ calories: 2555, protein: 224, carbs: 224, fat: 85 });
  });

  it("combines moderate TDEE with a bulk for a mid-age female", () => {
    // BMR 1314 → TDEE 2036.7 → calories 2337
    expect(
      calculateTargets({
        gender: "female",
        age: 35,
        heightCm: 160,
        weightKg: 65,
        activity: "moderate",
        goal: "gain",
      }),
    ).toEqual({ calories: 2337, protein: 175, carbs: 263, fat: 65 });
  });

  it("returns finite positive targets for extreme low weight/age", () => {
    // BMR 1046.5 → TDEE 1255.8 → 1256
    const targets = calculateTargets({
      gender: "female",
      age: 16,
      heightCm: 150,
      weightKg: 35,
      activity: "sedentary",
      goal: "maintain",
    });
    expect(targets).toEqual({ calories: 1256, protein: 79, carbs: 141, fat: 42 });
    for (const value of Object.values(targets)) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
  });

  it("returns finite positive targets for extreme high weight", () => {
    const targets = calculateTargets({
      gender: "male",
      age: 50,
      heightCm: 190,
      weightKg: 200,
      activity: "very",
      goal: "lose",
    });
    expect(targets).toEqual({ calories: 4576, protein: 400, carbs: 400, fat: 153 });
    for (const value of Object.values(targets)) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
  });

  it("returns finite positive targets for very high age", () => {
    const targets = calculateTargets({
      gender: "male",
      age: 90,
      heightCm: 170,
      weightKg: 70,
      activity: "sedentary",
      goal: "maintain",
    });
    expect(targets).toEqual({ calories: 1581, protein: 99, carbs: 178, fat: 53 });
    for (const value of Object.values(targets)) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
  });
});

describe("toISO / fromISO", () => {
  it("round-trips a local calendar date without shifting days", () => {
    const d = new Date(2026, 0, 15); // Jan 15, 2026, local midnight
    expect(toISO(d)).toBe("2026-01-15");
    expect(fromISO("2026-01-15").getTime()).toBe(d.getTime());
  });

  it("never crosses a day boundary via UTC conversion (unlike toISOString)", () => {
    // A time late in the local day, close to the next UTC day.
    const d = new Date(2026, 5, 30, 23, 30);
    expect(toISO(d)).toBe("2026-06-30");
  });

  it("pads single-digit months and days", () => {
    expect(toISO(new Date(2026, 2, 5))).toBe("2026-03-05");
  });
});

describe("todayISO", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reflects the local date regardless of the machine's UTC offset", () => {
    // Local time is just after midnight; UTC is still the previous day for
    // any timezone with a positive offset. todayISO() must use the local day.
    vi.setSystemTime(new Date(2026, 4, 10, 0, 30));
    expect(todayISO()).toBe("2026-05-10");
  });
});

describe("addDays", () => {
  it("moves forward and backward across month boundaries", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("formatGermanDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 10, 12, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("labels today, yesterday and tomorrow relative to the local date", () => {
    expect(formatGermanDate("2026-05-10")).toBe("Heute");
    expect(formatGermanDate("2026-05-09")).toBe("Gestern");
    expect(formatGermanDate("2026-05-11")).toBe("Morgen");
  });
});
