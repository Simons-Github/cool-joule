import { createServerFn } from "@tanstack/react-start";
import { OpenFoodFactsError, type FoodItem } from "@/lib/open-food-facts";
import { RateLimitError } from "@/lib/rate-limit";

const SEARCH_AUTH_MESSAGE = "Bitte anmelden, um zu suchen.";

async function requireSearchUserId(): Promise<string> {
  const { requireAuthenticatedUserId } = await import("@/lib/server-auth");
  try {
    return await requireAuthenticatedUserId(SEARCH_AUTH_MESSAGE);
  } catch (error) {
    if (error instanceof Error && error.message === SEARCH_AUTH_MESSAGE) {
      throw new OpenFoodFactsError("NETWORK", SEARCH_AUTH_MESSAGE);
    }
    throw error;
  }
}

function wrapOffError(error: unknown): never {
  if (error instanceof OpenFoodFactsError) throw error;
  if (error instanceof RateLimitError) {
    throw new OpenFoodFactsError("RATE_LIMITED", error.message);
  }
  throw new OpenFoodFactsError("NETWORK", "Suche fehlgeschlagen. Bitte erneut versuchen.", {
    cause: error,
  });
}

export const searchOpenFoodFacts = createServerFn({ method: "POST" })
  .validator((data: { query: string }) => ({
    query: typeof data?.query === "string" ? data.query : "",
  }))
  .handler(async ({ data }): Promise<FoodItem[]> => {
    const userId = await requireSearchUserId();
    const { enforceRateLimit } = await import("@/lib/rate-limit.server");
    const { searchProducts } = await import("@/lib/open-food-facts");
    try {
      await enforceRateLimit(userId, "off_search");
      return await searchProducts(data.query);
    } catch (error) {
      wrapOffError(error);
    }
  });

export const lookupOpenFoodFactsBarcode = createServerFn({ method: "POST" })
  .validator((data: { barcode: string }) => ({
    barcode: typeof data?.barcode === "string" ? data.barcode : "",
  }))
  .handler(async ({ data }): Promise<FoodItem> => {
    const userId = await requireSearchUserId();
    const { enforceRateLimit } = await import("@/lib/rate-limit.server");
    const { lookupProductByBarcode } = await import("@/lib/open-food-facts");
    try {
      await enforceRateLimit(userId, "off_barcode");
      return await lookupProductByBarcode(data.barcode);
    } catch (error) {
      wrapOffError(error);
    }
  });
