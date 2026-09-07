import { createServerFn } from "@tanstack/react-start";
import {
  FOOD_PHOTO_ATTEMPT_TIMEOUT_MS,
  FOOD_PHOTO_GOOGLE_MODEL,
  FOOD_PHOTO_MAX_ATTEMPTS,
  FOOD_PHOTO_MODEL,
  FOOD_PHOTO_PROMPT,
  FOOD_PHOTO_TIMEOUT_MESSAGE,
  FoodPhotoError,
  foodPhotoAnalysisSchema,
  isFoodPhotoTimeoutError,
  mapAnalyzedItems,
  validateImagePayload,
  type AnalyzedFoodItem,
  type FoodPhotoAnalysisOutput,
} from "@/lib/food-photo-analysis";
import { OWN_KEY_REQUIRED_MESSAGE, type FoodPhotoQuota } from "@/lib/food-photo-quota";
import type { AuthenticatedUser } from "@/lib/server-auth";

const UNAUTHENTICATED_MESSAGE = "Bitte anmelden, um Fotos zu analysieren.";
const EMPTY_OUTPUT_MESSAGE = "Die Analyse hat kein Ergebnis geliefert. Bitte erneut versuchen.";

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

async function generateFoodPhotoOutput(
  model: Parameters<typeof import("ai").generateText>[0]["model"],
  image: Uint8Array,
  mimeType: string,
): Promise<FoodPhotoAnalysisOutput> {
  const { generateText, Output } = await import("ai");
  const generate = () =>
    generateText({
      model,
      output: Output.object({
        schema: foodPhotoAnalysisSchema,
      }),
      abortSignal: AbortSignal.timeout(FOOD_PHOTO_ATTEMPT_TIMEOUT_MS),
      maxRetries: 0,
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingLevel: "minimal",
          },
        },
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              image,
              mediaType: mimeType,
            },
            { type: "text", text: FOOD_PHOTO_PROMPT },
          ],
        },
      ],
    });

  let lastError: unknown;
  for (let attempt = 0; attempt < FOOD_PHOTO_MAX_ATTEMPTS; attempt += 1) {
    try {
      const { output } = await generate();
      if (output) return output;
      lastError = new FoodPhotoError("ANALYSIS_FAILED", EMPTY_OUTPUT_MESSAGE);
    } catch (error) {
      lastError = error;
      const retryable = isFoodPhotoTimeoutError(error);
      if (!retryable || attempt === FOOD_PHOTO_MAX_ATTEMPTS - 1) throw error;
    }
  }

  throw lastError instanceof FoodPhotoError
    ? lastError
    : new FoodPhotoError("ANALYSIS_FAILED", EMPTY_OUTPUT_MESSAGE, { cause: lastError });
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
    const { logServerError } = await import("@/lib/server-auth");
    const { enforceRateLimit, toFoodPhotoRateLimitError } = await import("@/lib/rate-limit.server");
    const user = await requirePhotoUser();

    try {
      await enforceRateLimit(user.id, "food_photo_analyze");
      const resolved = await resolveFoodPhotoModel(user);
      const [{ loadNutritionCatalog }, { resolvePhotoItemsNutrition }] = await Promise.all([
        import("@/lib/food-photo-nutrition.server"),
        import("@/lib/food-photo-nutrition"),
      ]);

      const [output, catalog] = await Promise.all([
        generateFoodPhotoOutput(
          resolved.model as Parameters<typeof import("ai").generateText>[0]["model"],
          decodeBase64(data.imageBase64),
          data.mimeType,
        ),
        loadNutritionCatalog(user.id),
      ]);

      const items = resolvePhotoItemsNutrition(mapAnalyzedItems(output.items), catalog);
      if (resolved.usesAppKey) {
        const { claimServerKeyPhotoQuota } = await import("@/lib/food-photo-quota.server");
        await claimServerKeyPhotoQuota(user.id);
      }
      return { items };
    } catch (error) {
      if (error instanceof FoodPhotoError) throw error;
      const rateLimited = toFoodPhotoRateLimitError(error);
      if (rateLimited) throw rateLimited;
      if (isFoodPhotoTimeoutError(error)) {
        throw new FoodPhotoError("ANALYSIS_FAILED", FOOD_PHOTO_TIMEOUT_MESSAGE, { cause: error });
      }
      logServerError(error);
      throw new FoodPhotoError(
        "ANALYSIS_FAILED",
        "Die Analyse ist fehlgeschlagen. Bitte erneut versuchen.",
      );
    }
  });
