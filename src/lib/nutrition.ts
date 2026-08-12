export type Gender = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "very";
export type Goal = "lose" | "maintain" | "gain";
export type MealType = "breakfast" | "lunch" | "dinner" | "snacks";

export const MEALS: { key: MealType; label: string }[] = [
  { key: "breakfast", label: "Frühstück" },
  { key: "lunch", label: "Mittagessen" },
  { key: "dinner", label: "Abendessen" },
  { key: "snacks", label: "Snacks" },
];

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Wenig aktiv (Bürojob)",
  light: "Leicht aktiv (1–2x Sport)",
  moderate: "Mäßig aktiv (3–5x Sport)",
  very: "Sehr aktiv (6–7x Sport)",
};

export const GOAL_LABELS: Record<Goal, string> = {
  lose: "Abnehmen",
  maintain: "Gewicht halten",
  gain: "Muskelaufbau",
};

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

export function formatGermanDate(iso: string): string {
  const date = fromISO(iso);
  if (iso === todayISO()) return "Heute";
  if (iso === addDays(todayISO(), -1)) return "Gestern";
  if (iso === addDays(todayISO(), 1)) return "Morgen";
  return date.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}
