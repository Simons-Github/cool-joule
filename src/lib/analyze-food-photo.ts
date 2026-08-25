import { createServerFn } from "@tanstack/react-start";
import {
  FOOD_PHOTO_GOOGLE_MODEL,
  FOOD_PHOTO_MODEL,
  FOOD_PHOTO_PROMPT,
  FoodPhotoError,
  foodPhotoAnalysisSchema,
  mapAnalyzedItems,
  validateImagePayload,
  type AnalyzedFoodItem,
} from "@/lib/food-photo-analysis";
import { OWN_KEY_REQUIRED_MESSAGE, type FoodPhotoQuota } from "@/lib/food-photo-quota";
import type { AuthenticatedUser } from "@/lib/server-auth";

const UNAUTHENTICATED_MESSAGE = "Bitte anmelden, um Fotos zu analysieren.";

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
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

async function resolveFoodPhotoModel(
  user: AuthenticatedUser,
): Promise<{ model: unknown; usesAppKey: boolean }> {
  const { loadDecryptedUserGeminiApiKey } = await import("@/lib/user-gemini-key.server");
  let userKey: string | null = null;
  try {
    userKey = await loadDecryptedUserGeminiApiKey(user.id);
  } catch (error) {
    const { logServerError } = await import("@/lib/server-auth");
    logServerError(error);
    throw new FoodPhotoError(
      "ANALYSIS_FAILED",
      error instanceof Error
        ? error.message
        : "Die Analyse ist fehlgeschlagen. Bitte erneut versuchen.",
    );
  }

  if (userKey) {
    const { createGoogle } = await import("@ai-sdk/google");
    return {
      model: createGoogle({ apiKey: userKey })(FOOD_PHOTO_GOOGLE_MODEL),
      usesAppKey: false,
    };
  }

  const { isFoodPhotoAppKeyAllowed, hasFoodPhotoGatewayAuth } =
    await import("@/lib/food-photo-allowlist");
  if (!isFoodPhotoAppKeyAllowed(user)) {
    throw new FoodPhotoError("REQUIRES_OWN_KEY", OWN_KEY_REQUIRED_MESSAGE);
  }

  const geminiKey = process.env["GEMINI_API_KEY"] ?? process.env["GOOGLE_GENERATIVE_AI_API_KEY"];
  if (!geminiKey && !hasFoodPhotoGatewayAuth()) {
    throw new FoodPhotoError(
      "ANALYSIS_FAILED",
      "Kein API-Key gefunden. Bitte GEMINI_API_KEY in .env setzen oder einen eigenen Key im Profil hinterlegen.",
    );
  }

  if (geminiKey) {
    const { createGoogle } = await import("@ai-sdk/google");
    return {
      model: createGoogle({ apiKey: geminiKey })(FOOD_PHOTO_GOOGLE_MODEL),
      usesAppKey: true,
    };
  }

  return { model: FOOD_PHOTO_MODEL, usesAppKey: true };
}

export const getFoodPhotoQuota = createServerFn({ method: "POST" }).handler(
  async (): Promise<FoodPhotoQuota> => {
    const { getFoodPhotoQuotaForUser } = await import("@/lib/food-photo-quota.server");
    return getFoodPhotoQuotaForUser();
  },
);

export const analyzeFoodPhoto = createServerFn({ method: "POST" })
  .validator((data: { imageBase64: string; mimeType: string }) => {
    validateImagePayload(data.mimeType, data.imageBase64);
    return {
      imageBase64: data.imageBase64.replace(/\s/g, ""),
      mimeType: data.mimeType,
    };
  })
  .handler(async ({ data }): Promise<{ items: AnalyzedFoodItem[] }> => {
    const { generateText, Output } = await import("ai");
    const { logServerError } = await import("@/lib/server-auth");
    const { enforceRateLimit, toFoodPhotoRateLimitError } = await import("@/lib/rate-limit.server");
    const user = await requirePhotoUser();

    try {
      await enforceRateLimit(user.id, "food_photo_analyze");
      const resolved = await resolveFoodPhotoModel(user);
      const { output } = await generateText({
        model: resolved.model as Parameters<typeof generateText>[0]["model"],
        output: Output.object({
          schema: foodPhotoAnalysisSchema,
        }),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                image: decodeBase64(data.imageBase64),
                mediaType: data.mimeType,
              },
              { type: "text", text: FOOD_PHOTO_PROMPT },
            ],
          },
        ],
      });

      if (!output) {
        throw new FoodPhotoError(
          "ANALYSIS_FAILED",
          "Die Analyse hat kein Ergebnis geliefert. Bitte erneut versuchen.",
        );
      }

      const items = mapAnalyzedItems(output.items);
      if (resolved.usesAppKey) {
        const { claimServerKeyPhotoQuota } = await import("@/lib/food-photo-quota.server");
        await claimServerKeyPhotoQuota(user.id);
      }
      return { items };
    } catch (error) {
      if (error instanceof FoodPhotoError) throw error;
      const rateLimited = toFoodPhotoRateLimitError(error);
      if (rateLimited) throw rateLimited;
      logServerError(error);
      throw new FoodPhotoError(
        "ANALYSIS_FAILED",
        "Die Analyse ist fehlgeschlagen. Bitte erneut versuchen.",
      );
    }
  });
