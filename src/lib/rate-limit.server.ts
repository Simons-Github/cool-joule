import { FoodPhotoError } from "@/lib/food-photo-analysis";
import {
  RATE_LIMITED_MESSAGE,
  RATE_LIMIT_ACTIONS,
  RateLimitError,
  type RateLimitAction,
} from "@/lib/rate-limit";
import { logServerError } from "@/lib/server-auth";

export async function enforceRateLimit(userId: string, action: RateLimitAction): Promise<void> {
  const { maxCount, windowSeconds } = RATE_LIMIT_ACTIONS[action];
  let admin;
  try {
    const { createSupabaseAdmin } = await import("@/integrations/supabase/admin.server");
    admin = createSupabaseAdmin();
  } catch (error) {
    logServerError(error);
    throw new RateLimitError("Der Schutz vor zu vielen Anfragen ist derzeit nicht verfügbar.");
  }

  const { data: allowed, error } = await admin.rpc("claim_server_rate_limit", {
    p_user_id: userId,
    p_action: action,
    p_max_count: maxCount,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    logServerError(error);
    throw new RateLimitError("Der Schutz vor zu vielen Anfragen ist derzeit nicht verfügbar.");
  }

  if (allowed) return;
  throw new RateLimitError(RATE_LIMITED_MESSAGE);
}

export function toFoodPhotoRateLimitError(error: unknown): FoodPhotoError | null {
  if (error instanceof RateLimitError) {
    return new FoodPhotoError("RATE_LIMITED", error.message);
  }
  return null;
}
