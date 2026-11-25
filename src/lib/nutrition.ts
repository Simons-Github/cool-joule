import { localeFor, translate, type Lang, type MessageKey, type TFunction } from "@/lib/i18n";

export type Gender = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "very";
export type Goal = "lose" | "maintain" | "gain";
export type MealType = "breakfast" | "lunch" | "dinner" | "snacks";

/** Stored ids (saved in Supabase as `meal_type`): never translate these, only their labels. */
export const MEAL_TYPES: readonly MealType[] = ["breakfast", "lunch", "dinner", "snacks"];
export const ACTIVITY_LEVELS: readonly ActivityLevel[] = ["sedentary", "light", "moderate", "very"];
export const GOALS: readonly Goal[] = ["lose", "maintain", "gain"];

export function mealLabel(t: TFunction, meal: string): string {
  return (MEAL_TYPES as readonly string[]).includes(meal) ? t(`meal.${meal as MealType}`) : meal;
}

export function activityLabel(t: TFunction, level: ActivityLevel): string {
  return t(`activity.${level}`);
}

export function goalLabel(t: TFunction, goal: Goal): string {
  return t(`goal.${goal}`);
}

const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
};

export type Targets = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

/** Mifflin-St Jeor */
export function calculateTargets(input: {
  gender: Gender;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  goal: Goal;
}): Targets {
  const { gender, age, heightCm, weightKg, activity, goal } = input;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (gender === "male" ? 5 : -161);
  const tdee = bmr * ACTIVITY_FACTORS[activity];

  const calories = Math.round(goal === "lose" ? tdee - 500 : goal === "gain" ? tdee + 300 : tdee);

  const split =
    goal === "lose"
      ? { p: 0.35, c: 0.35, f: 0.3 }
      : goal === "gain"
        ? { p: 0.3, c: 0.45, f: 0.25 }
        : { p: 0.25, c: 0.45, f: 0.3 };

  return {
    calories,
    protein: Math.round((calories * split.p) / 4),
    carbs: Math.round((calories * split.c) / 4),
    fat: Math.round((calories * split.f) / 9),
  };
}

export function todayISO(): string {
  const d = new Date();
  return toISO(d);
}

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Parse YYYY-MM-DD as local calendar date (not UTC midnight). */
export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

export function addDays(iso: string, days: number): string {
  const date = fromISO(iso);
  date.setDate(date.getDate() + days);
  return toISO(date);
}

/** "Today" / "Yesterday" / "Tomorrow", otherwise a short localized date. */
export function formatDiaryDate(iso: string, lang: Lang = "de"): string {
  const date = fromISO(iso);
  const relative: [string, MessageKey][] = [
    [todayISO(), "date.today"],
    [addDays(todayISO(), -1), "date.yesterday"],
    [addDays(todayISO(), 1), "date.tomorrow"],
  ];
  for (const [day, key] of relative) {
    if (iso === day) return translate(lang, key);
  }
  return date.toLocaleDateString(localeFor(lang), {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

/** German short form, kept for existing callers and tests. */
export function formatGermanDate(iso: string): string {
  return formatDiaryDate(iso, "de");
}
