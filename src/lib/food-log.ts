import { addDays, todayISO } from "@/lib/nutrition";

export const QUICK_ADD_DEFAULT_NAME = "Schnell erfasst";
export const TARGET_TOLERANCE = 0.1;
export const RECENT_FOOD_DAYS = 14;
export const RECENT_FOOD_LIMIT = 20;

export type FoodLogMacros = {
  serving_size_g: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type FoodLogCopySource = FoodLogMacros & {
  user_id: string;
  meal_type: string;
  food_name: string;
  brand: string | null;
};

export type FoodLogInsert = FoodLogCopySource & {
  date: string;
  id?: string;
};

export type RecentFoodLog = FoodLogMacros & {
  food_name: string;
  brand: string | null;
  date: string;
  created_at?: string;
};

export type RecentFood = {
  name: string;
  brand: string | null;
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
  servingSizeG: number;
  count: number;
  lastDate: string;
};

export type DailyNutrition = {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  exercise: number;
  hasFood: boolean;
};

export type NutritionInsights = {
  avgCalories: number | null;
  avgProtein: number | null;
  daysInTarget: number;
  loggedDays: number;
  streak: number;
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function per100(value: number, grams: number): number {
  return round1((Number(value) / grams) * 100);
}

export function isQuickAddServing(grams: number): boolean {
  return Number(grams) <= 0;
}

export function scaleLoggedMacros(row: FoodLogMacros, newGrams: number): FoodLogMacros {
  const oldGrams = Number(row.serving_size_g);
  if (isQuickAddServing(oldGrams)) {
    return {
      serving_size_g: 0,
      calories: Number(row.calories),
      protein: Number(row.protein),
      carbs: Number(row.carbs),
      fat: Number(row.fat),
    };
  }
  const grams = Number(newGrams);
  if (!Number.isFinite(grams) || grams <= 0) {
    return {
      serving_size_g: oldGrams,
      calories: Number(row.calories),
      protein: Number(row.protein),
      carbs: Number(row.carbs),
      fat: Number(row.fat),
    };
  }
  const factor = grams / oldGrams;
  return {
    serving_size_g: grams,
    calories: Math.round(Number(row.calories) * factor),
    protein: round1(Number(row.protein) * factor),
    carbs: round1(Number(row.carbs) * factor),
    fat: round1(Number(row.fat) * factor),
  };
}

export function toCopiedInserts(rows: FoodLogCopySource[], newDate: string): FoodLogInsert[] {
  return rows.map((row) => ({
    user_id: row.user_id,
    date: newDate,
    meal_type: row.meal_type,
    food_name: row.food_name,
    brand: row.brand,
    serving_size_g: Number(row.serving_size_g),
    calories: Number(row.calories),
    protein: Number(row.protein),
    carbs: Number(row.carbs),
    fat: Number(row.fat),
  }));
}

export function netRemaining(input: { target: number; food: number; exercise: number }): number {
  return Math.round(Number(input.target) + Number(input.exercise) - Number(input.food));
}

export function groupRecentFoods(
  logs: RecentFoodLog[],
  options?: { days?: number; limit?: number; today?: string },
): RecentFood[] {
  const days = options?.days ?? RECENT_FOOD_DAYS;
  const limit = options?.limit ?? RECENT_FOOD_LIMIT;
  const today = options?.today ?? todayISO();
  const from = addDays(today, -(days - 1));

  const sorted = [...logs]
    .filter(
      (log) => log.date >= from && log.date <= today && !isQuickAddServing(log.serving_size_g),
    )
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });

  const byKey = new Map<string, RecentFood>();
  for (const log of sorted) {
    const grams = Number(log.serving_size_g);
    const kcal100 = per100(log.calories, grams);
    const key = `${log.food_name}|${log.brand ?? ""}|${Math.round(kcal100)}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    byKey.set(key, {
      name: log.food_name,
      brand: log.brand,
      kcal100,
      protein100: per100(log.protein, grams),
      carbs100: per100(log.carbs, grams),
      fat100: per100(log.fat, grams),
      servingSizeG: grams,
      count: 1,
      lastDate: log.date,
    });
  }

  return [...byKey.values()]
    .sort((a, b) => {
      if (a.lastDate !== b.lastDate) return a.lastDate < b.lastDate ? 1 : -1;
      return b.count - a.count;
    })
    .slice(0, limit);
}

export function eachDateInclusive(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

export function isDayInTarget(
  day: Pick<DailyNutrition, "calories" | "exercise" | "hasFood">,
  targetCalories: number,
  tolerance = TARGET_TOLERANCE,
): boolean {
  if (!day.hasFood || targetCalories <= 0) return false;
  const budget = targetCalories + Number(day.exercise);
  return Math.abs(Number(day.calories) - budget) / targetCalories <= tolerance;
}

export function aggregateDailyNutrition(
  foodLogs: Array<{
    date: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }>,
  exerciseLogs: Array<{ date: string; calories: number }>,
  fromDate: string,
  toDate: string,
): DailyNutrition[] {
  const foodByDate = new Map<
    string,
    { calories: number; protein: number; carbs: number; fat: number; hasFood: boolean }
  >();
  for (const log of foodLogs) {
    const current = foodByDate.get(log.date) ?? {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      hasFood: false,
    };
    current.calories += Number(log.calories);
    current.protein += Number(log.protein);
    current.carbs += Number(log.carbs);
    current.fat += Number(log.fat);
    current.hasFood = true;
    foodByDate.set(log.date, current);
  }

  const exerciseByDate = new Map<string, number>();
  for (const log of exerciseLogs) {
    exerciseByDate.set(log.date, (exerciseByDate.get(log.date) ?? 0) + Number(log.calories));
  }

  return eachDateInclusive(fromDate, toDate).map((date) => {
    const food = foodByDate.get(date);
    return {
      date,
      calories: food?.calories ?? 0,
      protein: food?.protein ?? 0,
      carbs: food?.carbs ?? 0,
      fat: food?.fat ?? 0,
      exercise: exerciseByDate.get(date) ?? 0,
      hasFood: food?.hasFood ?? false,
    };
  });
}

export function nutritionInsights(
  days: DailyNutrition[],
  targetCalories: number,
  options?: { tolerance?: number },
): NutritionInsights {
  const logged = days.filter((day) => day.hasFood);
  const loggedDays = logged.length;
  const avgCalories =
    loggedDays > 0
      ? Math.round(logged.reduce((sum, day) => sum + day.calories, 0) / loggedDays)
      : null;
  const avgProtein =
    loggedDays > 0 ? round1(logged.reduce((sum, day) => sum + day.protein, 0) / loggedDays) : null;
  const daysInTarget = logged.filter((day) =>
    isDayInTarget(day, targetCalories, options?.tolerance),
  ).length;

  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i]!;
    if (!isDayInTarget(day, targetCalories, options?.tolerance)) break;
    streak += 1;
  }

  return { avgCalories, avgProtein, daysInTarget, loggedDays, streak };
}
