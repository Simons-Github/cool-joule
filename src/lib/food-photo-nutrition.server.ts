import { groupRecentFoods, RECENT_FOOD_DAYS, type RecentFoodLog } from "@/lib/food-log";
import { addDays, todayISO } from "@/lib/nutrition";
import type { CatalogFood, NutritionCatalog } from "@/lib/food-photo-nutrition";

const EMPTY_CATALOG: NutritionCatalog = { recent: [], custom: [] };

export async function loadNutritionCatalog(userId: string): Promise<NutritionCatalog> {
  try {
    const { createSupabaseAdmin } = await import("@/integrations/supabase/admin.server");
    const admin = createSupabaseAdmin();
    const from = addDays(todayISO(), -(RECENT_FOOD_DAYS - 1));
    const today = todayISO();

    const [customRes, logsRes] = await Promise.all([
      admin
        .from("custom_foods")
        .select("name, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g")
        .eq("user_id", userId),
      admin
        .from("food_logs")
        .select("food_name, brand, date, created_at, serving_size_g, calories, protein, carbs, fat")
        .eq("user_id", userId)
        .gte("date", from)
        .lte("date", today)
        .order("date", { ascending: false }),
    ]);

    if (customRes.error || logsRes.error) {
      const { logServerError } = await import("@/lib/server-auth");
      if (customRes.error) logServerError(customRes.error);
      if (logsRes.error) logServerError(logsRes.error);
    }

    const recents = groupRecentFoods((logsRes.data ?? []) as RecentFoodLog[], { today });
    const recent: CatalogFood[] = recents.map((food) => ({
      name: food.name,
      kcal100: food.kcal100,
      protein100: food.protein100,
      carbs100: food.carbs100,
      fat100: food.fat100,
    }));
    const custom: CatalogFood[] = (customRes.data ?? []).map((food) => ({
      name: food.name,
      kcal100: food.calories_per_100g,
      protein100: food.protein_per_100g,
      carbs100: food.carbs_per_100g,
      fat100: food.fat_per_100g,
    }));

    return { recent, custom };
  } catch (error) {
    const { logServerError } = await import("@/lib/server-auth");
    logServerError(error);
    return EMPTY_CATALOG;
  }
}
