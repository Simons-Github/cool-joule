import { describe, expect, it } from "vitest";
import { DEMO_HISTORY_DAYS, buildDemoSeed, seedDemoAccount } from "./demo-seed";
import { addDays, calculateTargets } from "./nutrition";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const TODAY = "2026-11-25";

describe("buildDemoSeed", () => {
  const seed = buildDemoSeed(USER_ID, TODAY);
  const firstDay = addDays(TODAY, -(DEMO_HISTORY_DAYS - 1));

  it("tags every row with the demo user's id", () => {
    expect(seed.profile.id).toBe(USER_ID);
    for (const row of [...seed.foodLogs, ...seed.weightLogs, ...seed.exerciseLogs]) {
      expect(row.user_id).toBe(USER_ID);
    }
  });

  it("marks the profile as onboarded with targets derived from its body data", () => {
    expect(seed.profile.onboarded).toBe(true);
    const targets = calculateTargets({
      gender: "female",
      age: seed.profile.age!,
      heightCm: Number(seed.profile.height_cm),
      weightKg: Number(seed.profile.current_weight),
      activity: "moderate",
      goal: "lose",
    });
    expect(seed.profile).toMatchObject({
      gender: "female",
      activity_level: "moderate",
      goal: "lose",
      daily_calories: targets.calories,
      target_protein: targets.protein,
      target_carbs: targets.carbs,
      target_fat: targets.fat,
    });
  });

  it("keeps all dates inside the history window ending today", () => {
    const dates = [...seed.foodLogs, ...seed.weightLogs, ...seed.exerciseLogs].map((r) => r.date!);
    for (const date of dates) {
      expect(date >= firstDay && date <= TODAY).toBe(true);
    }
    expect(new Set(seed.foodLogs.map((r) => r.date)).size).toBe(DEMO_HISTORY_DAYS);
  });

  it("leaves dinner and snacks open today so the visitor can log something", () => {
    const todayMeals = new Set(
      seed.foodLogs.filter((r) => r.date === TODAY).map((r) => r.meal_type),
    );
    expect(todayMeals).toEqual(new Set(["breakfast", "lunch"]));
    const yesterdayMeals = new Set(
      seed.foodLogs.filter((r) => r.date === addDays(TODAY, -1)).map((r) => r.meal_type),
    );
    expect(yesterdayMeals.has("dinner")).toBe(true);
  });

  it("satisfies the food_logs check constraints", () => {
    for (const row of seed.foodLogs) {
      expect(["breakfast", "lunch", "dinner", "snacks"]).toContain(row.meal_type);
      expect(row.food_name.trim()).not.toBe("");
      expect(row.serving_size_g).toBeGreaterThan(0);
      for (const value of [row.calories, row.protein, row.carbs, row.fat]) {
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("has at most one weight per day, ends today and trends down", () => {
    const dates = seed.weightLogs.map((r) => r.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect(dates.at(-1)).toBe(TODAY);
    for (const row of seed.weightLogs) expect(row.weight_kg).toBeGreaterThan(0);
    expect(seed.weightLogs.at(-1)!.weight_kg).toBeLessThan(seed.weightLogs[0]!.weight_kg);
    expect(seed.profile.current_weight).toBe(seed.weightLogs.at(-1)!.weight_kg);
  });

  it("only creates manual exercise entries", () => {
    expect(seed.exerciseLogs.length).toBeGreaterThan(0);
    for (const row of seed.exerciseLogs) {
      expect(row.source).toBe("manual");
      expect(row.calories).toBeGreaterThanOrEqual(0);
    }
  });

  it("averages close to the calorie target on full days", () => {
    const fullDays = new Map<string, number>();
    for (const row of seed.foodLogs) {
      if (row.date === TODAY) continue;
      fullDays.set(row.date!, (fullDays.get(row.date!) ?? 0) + Number(row.calories));
    }
    const avg = [...fullDays.values()].reduce((a, b) => a + b, 0) / fullDays.size;
    const target = seed.profile.daily_calories!;
    expect(Math.abs(avg - target) / target).toBeLessThan(0.2);
  });

  it("handles month boundaries", () => {
    const early = buildDemoSeed(USER_ID, "2026-03-02");
    expect(early.foodLogs[0]!.date).toBe(addDays("2026-03-02", -(DEMO_HISTORY_DAYS - 1)));
    expect(early.foodLogs[0]!.date).toBe("2026-02-17");
  });
});

function fakeClient(errors: Partial<Record<string, { message: string }>> = {}) {
  const calls: { table: string; op: string; rows: unknown }[] = [];
  const client = {
    from(table: string) {
      const respond = (op: string) => (rows: unknown) => {
        calls.push({ table, op, rows });
        return Promise.resolve({ error: errors[table] ?? null });
      };
      return { upsert: respond("upsert"), insert: respond("insert") };
    },
  };
  return { client: client as unknown as Parameters<typeof seedDemoAccount>[0], calls };
}

describe("seedDemoAccount", () => {
  it("upserts the profile and inserts all logs", async () => {
    const { client, calls } = fakeClient();
    await seedDemoAccount(client, USER_ID, TODAY);
    expect(calls[0]).toMatchObject({ table: "profiles", op: "upsert" });
    expect(
      calls
        .slice(1)
        .map((c) => `${c.op}:${c.table}`)
        .sort(),
    ).toEqual(["insert:exercise_logs", "insert:food_logs", "insert:weight_logs"]);
  });

  it("stops before inserting logs when the profile write fails", async () => {
    const { client, calls } = fakeClient({ profiles: { message: "denied" } });
    await expect(seedDemoAccount(client, USER_ID, TODAY)).rejects.toMatchObject({
      message: "denied",
    });
    expect(calls).toHaveLength(1);
  });

  it("surfaces a failed log insert", async () => {
    const { client } = fakeClient({ weight_logs: { message: "duplicate" } });
    await expect(seedDemoAccount(client, USER_ID, TODAY)).rejects.toMatchObject({
      message: "duplicate",
    });
  });
});
