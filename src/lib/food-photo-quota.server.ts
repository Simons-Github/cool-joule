import { FoodPhotoError } from "@/lib/food-photo-analysis";
import {
  getServerKeyQuotaExceededMessage,
  serverKeyQuotaResetsAt,
  toLimitedFoodPhotoQuota,
  type FoodPhotoQuota,
} from "@/lib/food-photo-quota";
import { logServerError } from "@/lib/server-auth";

const UNAUTHENTICATED_MESSAGE = "Bitte anmelden, um Fotos zu analysieren.";
const QUOTA_CHECK_FAILED = "Das Analyse-Kontingent konnte nicht geprüft werden.";

async function getAdmin() {
  const { createSupabaseAdmin } = await import("@/integrations/supabase/admin.server");
  return createSupabaseAdmin();
}

async function requireUserId(): Promise<string> {
  const { requireAuthenticatedUserId } = await import("@/lib/server-auth");
  try {
    return await requireAuthenticatedUserId(UNAUTHENTICATED_MESSAGE);
  } catch (error) {
    if (error instanceof Error && error.message === UNAUTHENTICATED_MESSAGE) {
      throw new FoodPhotoError("UNAUTHENTICATED", UNAUTHENTICATED_MESSAGE);
    }
    throw error;
  }
}

export async function getFoodPhotoQuotaForUser(): Promise<FoodPhotoQuota> {
  const userId = await requireUserId();
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
    .eq("user_id", userId)
    .maybeSingle();

  if (keyError) {
    logServerError(keyError);
    throw new FoodPhotoError("ANALYSIS_FAILED", QUOTA_CHECK_FAILED);
  }

  if (keyRow) return { limited: false };

  const { data: usage, error: usageError } = await admin
    .from("food_photo_server_usage")
    .select("last_used_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (usageError) {
    logServerError(usageError);
    throw new FoodPhotoError("ANALYSIS_FAILED", QUOTA_CHECK_FAILED);
  }

  return toLimitedFoodPhotoQuota(usage?.last_used_at ? new Date(usage.last_used_at) : null);
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
    .select("last_used_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (usageError) {
    logServerError(usageError);
  }

  const lastUsed = usage?.last_used_at ? new Date(usage.last_used_at) : new Date();
  throw new FoodPhotoError(
    "RATE_LIMITED",
    getServerKeyQuotaExceededMessage(serverKeyQuotaResetsAt(lastUsed)),
  );
}
