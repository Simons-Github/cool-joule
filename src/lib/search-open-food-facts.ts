import { createServerFn } from "@tanstack/react-start";
import { OpenFoodFactsError, type FoodItem } from "@/lib/open-food-facts";

export const searchOpenFoodFacts = createServerFn({ method: "POST" })
  .validator((data: { query: string }) => ({
    query: typeof data?.query === "string" ? data.query : "",
  }))
  .handler(async ({ data }): Promise<FoodItem[]> => {
    const { requireAuthenticatedUserId } = await import("@/lib/server-auth");
    await requireAuthenticatedUserId("Bitte anmelden, um zu suchen.");

    const { searchProducts } = await import("@/lib/open-food-facts");
    try {
      return await searchProducts(data.query);
    } catch (error) {
      if (error instanceof OpenFoodFactsError) throw error;
      throw new OpenFoodFactsError("NETWORK", "Suche fehlgeschlagen. Bitte erneut versuchen.", {
        cause: error,
      });
    }
  });
