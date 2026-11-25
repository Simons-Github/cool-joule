import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  addDays,
  calculateTargets,
  todayISO,
  type ActivityLevel,
  type Gender,
  type Goal,
  type MealType,
} from "@/lib/nutrition";

/** Days of history including today (today = offset 0). */
export const DEMO_HISTORY_DAYS = 14;

type Tables = Database["public"]["Tables"];
export type DemoProfile = Tables["profiles"]["Insert"] & { id: string };
export type DemoFoodLog = Tables["food_logs"]["Insert"] & { meal_type: MealType };
export type DemoWeightLog = Tables["weight_logs"]["Insert"];
export type DemoExerciseLog = Tables["exercise_logs"]["Insert"];

export type DemoSeed = {
  profile: DemoProfile;
  foodLogs: DemoFoodLog[];
  weightLogs: DemoWeightLog[];
  exerciseLogs: DemoExerciseLog[];
};

type DemoFood = {
  name: string;
  brand: string | null;
  servingG: number;
  /** kcal, protein, carbs, fat per 100 g */
  per100: [number, number, number, number];
};

const FOODS = {
  porridge: { name: "Porridge mit Beeren", brand: null, servingG: 300, per100: [118, 4.6, 18, 3] },
  skyr: { name: "Skyr natur", brand: "Arla", servingG: 250, per100: [63, 11, 4, 0.2] },
  breadCheese: {
    name: "Vollkornbrot mit Käse",
    brand: null,
    servingG: 130,
    per100: [255, 13, 27, 10],
  },
  scrambledEggs: { name: "Rührei", brand: null, servingG: 180, per100: [150, 11, 1.5, 11] },
  chickenRice: {
    name: "Hähnchenbrust mit Reis",
    brand: null,
    servingG: 400,
    per100: [150, 14, 18, 2],
  },
  lentilCurry: { name: "Linsen-Curry", brand: null, servingG: 400, per100: [125, 6, 16, 3.5] },
  bolognese: {
    name: "Spaghetti Bolognese",
    brand: null,
    servingG: 420,
    per100: [160, 8, 20, 5],
  },
  salmon: {
    name: "Lachs mit Ofenkartoffeln",
    brand: null,
    servingG: 400,
    per100: [140, 10, 12, 6],
  },
  greekSalad: {
    name: "Griechischer Salat mit Feta",
    brand: null,
    servingG: 320,
    per100: [115, 5, 5, 8.5],
  },
  wrap: { name: "Falafel-Wrap", brand: null, servingG: 280, per100: [210, 7, 26, 8] },
  apple: { name: "Apfel", brand: null, servingG: 180, per100: [52, 0.3, 14, 0.2] },
  banana: { name: "Banane", brand: null, servingG: 120, per100: [93, 1.2, 20, 0.2] },
  proteinBar: {
    name: "Proteinriegel Schoko",
    brand: "Joule Sports",
    servingG: 45,
    per100: [360, 33, 30, 12],
  },
  almonds: { name: "Mandeln", brand: null, servingG: 25, per100: [600, 21, 9, 52] },
} satisfies Record<string, DemoFood>;

type FoodKey = keyof typeof FOODS;

const BREAKFASTS: FoodKey[][] = [
  ["porridge"],
  ["skyr", "banana"],
  ["breadCheese"],
  ["scrambledEggs", "breadCheese"],
];
const LUNCHES: FoodKey[][] = [
  ["chickenRice"],
  ["lentilCurry"],
  ["greekSalad", "breadCheese"],
  ["wrap"],
];
const DINNERS: FoodKey[][] = [
  ["bolognese"],
  ["salmon"],
  ["greekSalad"],
  ["chickenRice"],
  ["lentilCurry"],
];
const SNACKS: FoodKey[][] = [["apple"], ["proteinBar"], ["almonds", "apple"], ["banana"], []];

const EXERCISES: { offset: number; name: string; calories: number }[] = [
  { offset: -12, name: "Laufen 5 km", calories: 320 },
  { offset: -9, name: "Krafttraining", calories: 250 },
  { offset: -6, name: "Radfahren", calories: 410 },
  { offset: -3, name: "Laufen 5 km", calories: 300 },
  { offset: -1, name: "Yoga", calories: 120 },
];

const PROFILE_INPUT: {
  gender: Gender;
  age: number;
  heightCm: number;
  targetWeightKg: number;
  activity: ActivityLevel;
  goal: Goal;
} = {
  gender: "female",
  age: 31,
  heightCm: 168,
  targetWeightKg: 66,
  activity: "moderate",
  goal: "lose",
};

const START_WEIGHT_KG = 73.6;
const WEIGHT_LOSS_PER_DAY_KG = 0.12;
// Small deterministic day-to-day noise so the chart does not look like a ruler.
const WEIGHT_NOISE_KG = [0.2, -0.1, 0.3, 0, -0.2, 0.1, 0.2, -0.1, 0, 0.1, -0.2, 0.1, 0, 0];

const round1 = (value: number) => Math.round(value * 10) / 10;

function toFoodLog(userId: string, date: string, mealType: MealType, key: FoodKey): DemoFoodLog {
  const food: DemoFood = FOODS[key];
  const factor = food.servingG / 100;
  const [kcal, protein, carbs, fat] = food.per100;
  return {
    user_id: userId,
    date,
    meal_type: mealType,
    food_name: food.name,
    brand: food.brand,
    serving_size_g: food.servingG,
    calories: Math.round(kcal * factor),
    protein: round1(protein * factor),
    carbs: round1(carbs * factor),
    fat: round1(fat * factor),
  };
}

function weightForDay(dayIndex: number): number {
  return round1(
    START_WEIGHT_KG - dayIndex * WEIGHT_LOSS_PER_DAY_KG + (WEIGHT_NOISE_KG[dayIndex] ?? 0),
  );
}

/**
 * Builds the sample data for a fresh demo account. Pure: dates are relative to
 * `today` (local calendar day, same helper as the diary) so "Heute" is never empty.
 * Today only has breakfast and lunch, leaving dinner for the visitor to log.
 */
export function buildDemoSeed(userId: string, today: string = todayISO()): DemoSeed {
  const foodLogs: DemoFoodLog[] = [];
  const weightLogs: DemoWeightLog[] = [];

  for (let dayIndex = 0; dayIndex < DEMO_HISTORY_DAYS; dayIndex++) {
    const offset = dayIndex - (DEMO_HISTORY_DAYS - 1);
    const date = addDays(today, offset);
    const isToday = offset === 0;

    const meals: [MealType, FoodKey[]][] = [
      ["breakfast", BREAKFASTS[dayIndex % BREAKFASTS.length]!],
      ["lunch", LUNCHES[dayIndex % LUNCHES.length]!],
    ];
    if (!isToday) {
      meals.push(["dinner", DINNERS[dayIndex % DINNERS.length]!]);
      meals.push(["snacks", SNACKS[dayIndex % SNACKS.length]!]);
    }
    for (const [mealType, keys] of meals) {
      for (const key of keys) foodLogs.push(toFoodLog(userId, date, mealType, key));
    }

    // Weigh-ins every other day plus today, like a realistic user.
    if (dayIndex % 2 === 0 || isToday) {
      weightLogs.push({ user_id: userId, date, weight_kg: weightForDay(dayIndex) });
    }
  }

  const exerciseLogs: DemoExerciseLog[] = EXERCISES.map((exercise) => ({
    user_id: userId,
    date: addDays(today, exercise.offset),
    name: exercise.name,
    calories: exercise.calories,
    source: "manual",
  }));

  const currentWeight = weightLogs[weightLogs.length - 1]!.weight_kg;
  const targets = calculateTargets({
    gender: PROFILE_INPUT.gender,
    age: PROFILE_INPUT.age,
    heightCm: PROFILE_INPUT.heightCm,
    weightKg: currentWeight,
    activity: PROFILE_INPUT.activity,
    goal: PROFILE_INPUT.goal,
  });

  const profile: DemoProfile = {
    id: userId,
    display_name: "Demo",
    gender: PROFILE_INPUT.gender,
    age: PROFILE_INPUT.age,
    height_cm: PROFILE_INPUT.heightCm,
    current_weight: currentWeight,
    target_weight: PROFILE_INPUT.targetWeightKg,
    activity_level: PROFILE_INPUT.activity,
    goal: PROFILE_INPUT.goal,
    daily_calories: targets.calories,
    target_protein: targets.protein,
    target_carbs: targets.carbs,
    target_fat: targets.fat,
    onboarded: true,
  };

  return { profile, foodLogs, weightLogs, exerciseLogs };
}

/**
 * Writes the demo seed with the visitor's own session, so every row goes through
 * the normal RLS policies (no service key involved).
 */
export async function seedDemoAccount(
  client: SupabaseClient<Database>,
  userId: string,
  today: string = todayISO(),
): Promise<void> {
  const seed = buildDemoSeed(userId, today);

  // The profile row is created by the auth trigger; upsert covers the race either way.
  const { error: profileError } = await client.from("profiles").upsert(seed.profile);
  if (profileError) throw profileError;

  const results = await Promise.all([
    client.from("food_logs").insert(seed.foodLogs),
    client.from("weight_logs").insert(seed.weightLogs),
    client.from("exercise_logs").insert(seed.exerciseLogs),
  ]);
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
}
