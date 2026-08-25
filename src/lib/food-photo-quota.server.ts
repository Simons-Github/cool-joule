import { FoodPhotoError } from "@/lib/food-photo-analysis";
import {
  getServerKeyQuotaExceededMessage,
  ownKeyRequiredQuota,
  serverKeyQuotaResetsAt,
  toLimitedFoodPhotoQuota,
  type FoodPhotoQuota,
} from "@/lib/food-photo-quota";
import { isFoodPhotoAppKeyAllowed } from "@/lib/food-photo-allowlist";
import { logServerError, type AuthenticatedUser } from "@/lib/server-auth";

const UNAUTHENTICATED_MESSAGE = "Bitte anmelden, um Fotos zu analysieren.";
const QUOTA_CHECK_FAILED = "Das Analyse-Kontingent konnte nicht geprüft werden.";

async function getAdmin() {
  const { createSupabaseAdmin } = await import("@/integrations/supabase/admin.server");
  return createSupabaseAdmin();
}

async function requirePhotoUser(): Promise<AuthenticatedUser> {
  const { requireAuthenticatedUser } = await import("@/lib/server-auth");
  try {
    return await requireAuthenticatedUser(UNAUTHENTICATED_MESSAGE);
  } catch (error) {
    if (error instanceof Error && error.message === UNAUTHENTICATED_MESSAGE) {
      throw new FoodPhotoError("UNAUTHENTICATED", UNAUTHENTICATED_MESSAGE);
    }
    throw error;
  }
}

export async function getFoodPhotoQuotaForUser(): Promise<FoodPhotoQuota> {
  const user = await requirePhotoUser();
  let admin;
  try {
    admin = await getAdmin();
  } catch (error) {
    logServerError(error);
    throw new FoodPhotoError("ANALYSIS_FAILED", QUOTA_CHECK_FAILED);
  }

  const { data: keyRow, error: keyError } = await admin
    .from("user_gemini_keys")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (keyError) {
    logServerError(keyError);
    throw new FoodPhotoError("ANALYSIS_FAILED", QUOTA_CHECK_FAILED);
  }

  if (keyRow) return { limited: false };

  if (!isFoodPhotoAppKeyAllowed(user)) return ownKeyRequiredQuota();

  const { data: usage, error: usageError } = await admin
    .from("food_photo_server_usage")
    .select("window_started_at, use_count")
    .eq("user_id", user.id)
    .maybeSingle();

  if (usageError) {
    logServerError(usageError);
    throw new FoodPhotoError("ANALYSIS_FAILED", QUOTA_CHECK_FAILED);
  }

  return toLimitedFoodPhotoQuota(
    usage
      ? { windowStartedAt: new Date(usage.window_started_at), useCount: usage.use_count }
      : null,
  );
}

export async function claimServerKeyPhotoQuota(userId: string): Promise<void> {
  let admin;
  try {
    admin = await getAdmin();
  } catch (error) {
    logServerError(error);
    throw new FoodPhotoError(
      "ANALYSIS_FAILED",
      "Die Fotoanalyse ohne eigenen API-Key ist derzeit nicht verfügbar. Bitte einen Key im Profil hinterlegen.",
    );
  }

  const { data: claimedAt, error: claimError } = await admin.rpc("claim_food_photo_server_usage", {
    p_user_id: userId,
  });

  if (claimError) {
    logServerError(claimError);
    throw new FoodPhotoError("ANALYSIS_FAILED", QUOTA_CHECK_FAILED);
  }

  if (claimedAt) return;

  const { data: usage, error: usageError } = await admin
    .from("food_photo_server_usage")
    .select("window_started_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (usageError) {
    logServerError(usageError);
  }

  const windowStartedAt = usage?.window_started_at ? new Date(usage.window_started_at) : new Date();
  throw new FoodPhotoError(
    "RATE_LIMITED",
    getServerKeyQuotaExceededMessage(serverKeyQuotaResetsAt(windowStartedAt)),
  );
}
