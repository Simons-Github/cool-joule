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
import type { FoodPhotoQuota } from "@/lib/food-photo-quota";

const UNAUTHENTICATED_MESSAGE = "Bitte anmelden, um Fotos zu analysieren.";

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function requirePhotoUserId(): Promise<string> {
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

async function resolveFoodPhotoModel(userId: string) {
  const { loadDecryptedUserGeminiApiKey } = await import("@/lib/user-gemini-key.server");
  let userKey: string | null = null;
  try {
    userKey = await loadDecryptedUserGeminiApiKey(userId);
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
    return createGoogle({ apiKey: userKey })(FOOD_PHOTO_GOOGLE_MODEL);
  }

  const geminiKey = process.env["GEMINI_API_KEY"] ?? process.env["GOOGLE_GENERATIVE_AI_API_KEY"];
  const hasGatewayAuth = Boolean(process.env["AI_GATEWAY_API_KEY"] || process.env["VERCEL"]);
  if (!geminiKey && !hasGatewayAuth) {
    throw new FoodPhotoError(
      "ANALYSIS_FAILED",
      "Kein API-Key gefunden. Bitte GEMINI_API_KEY in .env setzen oder einen eigenen Key im Profil hinterlegen.",
    );
  }

  const { claimServerKeyPhotoQuota } = await import("@/lib/food-photo-quota.server");
  await claimServerKeyPhotoQuota(userId);

  if (geminiKey) {
    const { createGoogle } = await import("@ai-sdk/google");
    return createGoogle({ apiKey: geminiKey })(FOOD_PHOTO_GOOGLE_MODEL);
  }

  return FOOD_PHOTO_MODEL;
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
    const userId = await requirePhotoUserId();

    try {
      const { output } = await generateText({
        model: await resolveFoodPhotoModel(userId),
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

      return { items: mapAnalyzedItems(output.items) };
    } catch (error) {
      if (error instanceof FoodPhotoError) throw error;
      logServerError(error);
      throw new FoodPhotoError(
        "ANALYSIS_FAILED",
        "Die Analyse ist fehlgeschlagen. Bitte erneut versuchen.",
      );
    }
  });
