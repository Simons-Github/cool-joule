import {
  round1,
  type AnalyzedFoodItem,
  type FoodPhotoNutritionSource,
} from "@/lib/food-photo-analysis";
import { GENERIC_FOODS } from "@/lib/food-photo-generic-foods";

const STOPWORDS = new Set([
  "mit",
  "und",
  "an",
  "auf",
  "vom",
  "von",
  "der",
  "die",
  "das",
  "den",
  "dem",
  "ein",
  "eine",
  "in",
  "im",
  "am",
  "aus",
  "oder",
  "extra",
  "dazu",
]);

const PREP_WORDS = new Set([
  "gekocht",
  "gebraten",
  "gegrillt",
  "roh",
  "geduenstet",
  "gebacken",
  "paniert",
  "frittiert",
  "gedampft",
]);

/** Allowed leftover when one German compound starts with another ("Hähnchenbrustfilet"). */
const COMPOUND_SUFFIXES = new Set([
  "filet",
  "brust",
  "fleisch",
  "stuck",
  "stuecke",
  "scheibe",
  "scheiben",
]);

const MIN_COMPOUND_PREFIX = 6;

export type CatalogFood = {
  name: string;
  aliases?: readonly string[];
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
};

export type NutritionCatalog = {
  recent: CatalogFood[];
  custom: CatalogFood[];
};

export type NutritionMatch = {
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
  source: Exclude<FoodPhotoNutritionSource, "model">;
  matchedName: string;
};

export function normalizeFoodName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function foodNameTokens(name: string): string[] {
  return normalizeFoodName(name)
    .split(" ")
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

function compoundTokenMatch(left: string, right: string): boolean {
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  if (shorter.length < MIN_COMPOUND_PREFIX) return false;
  if (!longer.startsWith(shorter)) return false;
  return COMPOUND_SUFFIXES.has(longer.slice(shorter.length));
}

function tokenIn(token: string, haystack: string[]): boolean {
  return haystack.some((item) => item === token || compoundTokenMatch(token, item));
}

function tokenSetsMatch(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (!shorter.every((token) => tokenIn(token, longer))) return false;
  if (shorter.length === 1) {
    const token = shorter[0]!;
    if (PREP_WORDS.has(token) || token.length < 2) return false;
  }
  return true;
}

function namesLooselyEqual(a: string, b: string): boolean {
  const left = normalizeFoodName(a);
  const right = normalizeFoodName(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return tokenSetsMatch(foodNameTokens(left), foodNameTokens(right));
}

const GENERIC_VARIANT_GROUPS: string[][] = GENERIC_FOODS.map((food) =>
  [food.name, ...food.aliases].map((value) => normalizeFoodName(value)).filter(Boolean),
);

const GENERIC_VARIANT_LOOKUP = new Map<string, string[]>();
for (const group of GENERIC_VARIANT_GROUPS) {
  for (const variant of group) GENERIC_VARIANT_LOOKUP.set(variant, group);
}

function variantStrings(name: string, extraAliases: readonly string[] = []): string[] {
  const variants = new Set<string>();
  const add = (value: string) => {
    const normalized = normalizeFoodName(value);
    if (normalized) variants.add(normalized);
  };
  add(name);
  for (const alias of extraAliases) add(alias);

  for (const existing of [...variants]) {
    const group = GENERIC_VARIANT_LOOKUP.get(existing);
    if (group) {
      for (const variant of group) variants.add(variant);
    }
  }

  const hasExactGroup = [...variants].some((value) => GENERIC_VARIANT_LOOKUP.has(value));
  if (!hasExactGroup) {
    for (const group of GENERIC_VARIANT_GROUPS) {
      const belongs = group.some((variant) =>
        [...variants].some((existing) => namesLooselyEqual(existing, variant)),
      );
      if (!belongs) continue;
      for (const variant of group) variants.add(variant);
    }
  }

  return [...variants];
}

function variantsOverlap(left: readonly string[], right: readonly string[]): boolean {
  const rightSet = new Set(right);
  if (left.some((variant) => rightSet.has(variant))) return true;
  return left.some((queryVariant) =>
    right.some((candidateVariant) => namesLooselyEqual(queryVariant, candidateVariant)),
  );
}

export function isStrictFoodNameMatch(
  query: string,
  candidate: string,
  aliases: readonly string[] = [],
): boolean {
  return variantsOverlap(variantStrings(query), variantStrings(candidate, aliases));
}

function findCatalogMatch(
  queryVariants: readonly string[],
  foods: readonly CatalogFood[],
): CatalogFood | null {
  return (
    foods.find((food) => variantsOverlap(queryVariants, variantStrings(food.name, food.aliases))) ??
    null
  );
}

export const GENERIC_CATALOG: CatalogFood[] = GENERIC_FOODS.map((food) => ({
  name: food.name,
  aliases: food.aliases,
  kcal100: food.kcal100,
  protein100: food.protein100,
  carbs100: food.carbs100,
  fat100: food.fat100,
}));

export function pickNutritionMatch(
  query: string,
  catalog: NutritionCatalog,
): NutritionMatch | null {
  const queryVariants = variantStrings(query);
  const recent = findCatalogMatch(queryVariants, catalog.recent);
  if (recent) return toMatch(recent, "recent");
  const custom = findCatalogMatch(queryVariants, catalog.custom);
  if (custom) return toMatch(custom, "custom");
  const generic = findCatalogMatch(queryVariants, GENERIC_CATALOG);
  if (generic) return toMatch(generic, "generic");
  return null;
}

function toMatch(
  food: CatalogFood,
  source: Exclude<FoodPhotoNutritionSource, "model">,
): NutritionMatch {
  return {
    kcal100: round1(food.kcal100),
    protein100: round1(food.protein100),
    carbs100: round1(food.carbs100),
    fat100: round1(food.fat100),
    source,
    matchedName: food.name,
  };
}

export function resolvePhotoItemNutrition(
  item: AnalyzedFoodItem,
  catalog: NutritionCatalog,
): AnalyzedFoodItem {
  const match = pickNutritionMatch(item.name, catalog);
  if (!match) return { ...item, nutritionSource: "model" };
  return {
    ...item,
    kcal100: match.kcal100,
    protein100: match.protein100,
    carbs100: match.carbs100,
    fat100: match.fat100,
    nutritionSource: match.source,
  };
}

export function resolvePhotoItemsNutrition(
  items: AnalyzedFoodItem[],
  catalog: NutritionCatalog,
): AnalyzedFoodItem[] {
  return items.map((item) => resolvePhotoItemNutrition(item, catalog));
}
