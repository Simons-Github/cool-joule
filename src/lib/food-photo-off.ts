import { round1, type AnalyzedFoodItem } from "@/lib/food-photo-analysis";
import type { FoodItem, SearchProductsOptions } from "@/lib/open-food-facts";

export const FOOD_PHOTO_OFF_TIMEOUT_MS = 5_000;
export const FOOD_PHOTO_OFF_PAGE_SIZE = 8;
export const FOOD_PHOTO_OFF_CONCURRENCY = 4;
const MIN_OVERLAP_LENGTH = 4;

export type OffSearchFn = (query: string, options?: SearchProductsOptions) => Promise<FoodItem[]>;

export function isClearOffNameMatch(
  query: string,
  productName: string,
  brand?: string | null,
): boolean {
  const q = query.trim().toLowerCase();
  const n = productName.trim().toLowerCase();
  if (!q || !n) return false;
  if (namesOverlap(q, n)) return true;
  const b = brand?.trim().toLowerCase() ?? "";
  return Boolean(b && q.length >= MIN_OVERLAP_LENGTH && b.includes(q));
}

function namesOverlap(query: string, name: string): boolean {
  if (name === query) return true;
  if (name.startsWith(query) || query.startsWith(name)) return true;
  if (query.length >= MIN_OVERLAP_LENGTH && name.includes(query)) return true;
  if (name.length >= MIN_OVERLAP_LENGTH && query.includes(name)) return true;
  return false;
}

export function pickClearOffMatch(query: string, hits: ReadonlyArray<FoodItem>): FoodItem | null {
  return hits.find((hit) => isClearOffNameMatch(query, hit.name, hit.brand)) ?? null;
}

export function mergeOffNutrition(
  item: AnalyzedFoodItem,
  match: FoodItem | null,
): AnalyzedFoodItem {
  if (!match) {
    return { ...item, confidence: "low" };
  }
  return {
    ...item,
    kcal100: round1(match.kcal100),
    protein100: round1(match.protein100),
    carbs100: round1(match.carbs100),
    fat100: round1(match.fat100),
  };
}

export async function enrichPhotoItemsWithOff(
  items: AnalyzedFoodItem[],
  options: {
    search?: OffSearchFn;
    signal?: AbortSignal;
    concurrency?: number;
  } = {},
): Promise<AnalyzedFoodItem[]> {
  if (items.length === 0) return items;

  const search = options.search ?? (await defaultSearch());
  const concurrency = Math.max(1, options.concurrency ?? FOOD_PHOTO_OFF_CONCURRENCY);
  const signal = options.signal;

  return mapPool(items, concurrency, async (item) => {
    if (signal?.aborted) return mergeOffNutrition(item, null);
    try {
      const hits = await search(item.name, {
        pageSize: FOOD_PHOTO_OFF_PAGE_SIZE,
        signal: searchSignal(signal),
      });
      return mergeOffNutrition(item, pickClearOffMatch(item.name, hits));
    } catch {
      return mergeOffNutrition(item, null);
    }
  });
}

function searchSignal(parent?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(FOOD_PHOTO_OFF_TIMEOUT_MS);
  return parent ? AbortSignal.any([parent, timeout]) : timeout;
}

async function defaultSearch(): Promise<OffSearchFn> {
  const { searchProducts } = await import("@/lib/open-food-facts");
  return searchProducts;
}

async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index] as T);
    }
  }

  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}
