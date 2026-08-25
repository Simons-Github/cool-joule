import { createServerFn } from "@tanstack/react-start";
import {
  FOOD_PHOTO_MODEL,
  FOOD_PHOTO_PROMPT,
  FoodPhotoError,
  foodPhotoAnalysisSchema,
  mapAnalyzedItems,
  validateImagePayload,
  type AnalyzedFoodItem,
} from "@/lib/food-photo-analysis";

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export const analyzeFoodPhoto = createServerFn({ method: "POST" })
  .validator((data: { imageBase64: string; mimeType: string }) => {
    validateImagePayload(data.mimeType, data.imageBase64);
    return {
      imageBase64: data.imageBase64.replace(/\s/g, ""),
      mimeType: data.mimeType,
    };
  })
  .handler(async ({ data }): Promise<{ items: AnalyzedFoodItem[] }> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const { generateText, Output } = await import("ai");
    const { supabase } = await import("@/integrations/supabase/client");

    const authorization = getRequestHeader("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : undefined;

    if (!token) {
      throw new FoodPhotoError("UNAUTHENTICATED", "Bitte anmelden, um Fotos zu analysieren.");
    }

    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData.user) {
      throw new FoodPhotoError("UNAUTHENTICATED", "Bitte anmelden, um Fotos zu analysieren.");
    }

    try {
      const { output } = await generateText({
        model: FOOD_PHOTO_MODEL,
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
      console.error(error);
      throw new FoodPhotoError(
        "ANALYSIS_FAILED",
        "Die Analyse ist fehlgeschlagen. Bitte erneut versuchen.",
        { cause: error },
      );
    }
  });
