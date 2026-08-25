import { z } from "zod";

/** Latest Gemini Flash with vision (AI Gateway uses provider/model). */
export const FOOD_PHOTO_MODEL = "google/gemini-3.7-flash";
/** Same model when calling Google Generative AI directly with GEMINI_API_KEY. */
export const FOOD_PHOTO_GOOGLE_MODEL = "gemini-3.7-flash";

export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export const MAX_IMAGE_BYTES = Math.floor(1.5 * 1024 * 1024);
export const MAX_IMAGE_EDGE = 1280;

export type FoodPhotoConfidence = "high" | "medium" | "low";

export type AnalyzedFoodItem = {
  name: string;
  estimatedGrams: number;
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
  confidence: FoodPhotoConfidence;
};

export type PhotoDraft = AnalyzedFoodItem & {
  id: string;
  selected: boolean;
  grams: string;
};

export function toPhotoDrafts(items: AnalyzedFoodItem[]): PhotoDraft[] {
  return items.map((item, index) => ({
    ...item,
    id: `${item.name}-${index}`,
    selected: true,
    grams: String(item.estimatedGrams),
  }));
}

export const MAX_FOOD_PHOTO_ITEMS = 40;
export const MAX_FOOD_PHOTO_NAME_LENGTH = 120;

export type FoodPhotoErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_IMAGE"
  | "TOO_LARGE"
  | "UNSUPPORTED_TYPE"
  | "NO_FOOD"
  | "RATE_LIMITED"
  | "REQUIRES_OWN_KEY"
  | "ANALYSIS_FAILED";

export class FoodPhotoError extends Error {
  readonly code: FoodPhotoErrorCode;

  constructor(code: FoodPhotoErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "FoodPhotoError";
    this.code = code;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export const foodPhotoItemSchema = z.object({
  name: z.string().max(MAX_FOOD_PHOTO_NAME_LENGTH),
  estimatedGrams: z.coerce.number(),
  kcal100: z.coerce.number(),
  protein100: z.coerce.number(),
  carbs100: z.coerce.number(),
  fat100: z.coerce.number(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
});

export const foodPhotoAnalysisSchema = z.object({
  items: z.array(foodPhotoItemSchema).max(MAX_FOOD_PHOTO_ITEMS),
});

export type FoodPhotoAnalysisOutput = z.infer<typeof foodPhotoAnalysisSchema>;

export const FOOD_PHOTO_PROMPT = `Analysiere das Foto einer Mahlzeit.

Regeln:
- Antworte auf Deutsch bei den Lebensmittelnamen (übliche Bezeichnungen).
- Liste jedes sichtbare Lebensmittel getrennt (z. B. Reis, Hähnchen, Salat — nicht den ganzen Teller als ein Item).
- Schätze die Portionsgröße in Gramm und die Nährwerte pro 100 g.
- Erfinde nichts: wenn kein Essen erkennbar oder das Bild unklar ist, gib items als leeres Array zurück.
- confidence: high bei klar erkennbarem Gericht, medium bei Schätzung, low bei unsicherer Erkennung.`;

export function isAllowedImageMimeType(value: string): value is AllowedImageMimeType {
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

export function estimateBase64Bytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function validateImagePayload(mimeType: string, base64: string): void {
  const trimmed = base64.replace(/\s/g, "");
  if (!trimmed) {
    throw new FoodPhotoError("INVALID_IMAGE", "Bitte ein Foto aufnehmen oder ein Bild hochladen.");
  }
  if (!isAllowedImageMimeType(mimeType)) {
    throw new FoodPhotoError(
      "UNSUPPORTED_TYPE",
      "Dieses Bildformat wird nicht unterstützt. Bitte JPEG, PNG oder WebP verwenden.",
    );
  }
  if (estimateBase64Bytes(trimmed) > MAX_IMAGE_BYTES) {
    throw new FoodPhotoError(
      "TOO_LARGE",
      "Das Bild ist zu groß. Bitte ein kleineres Foto verwenden.",
    );
  }
}

export function clampNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function mapAnalyzedItem(raw: z.infer<typeof foodPhotoItemSchema>): AnalyzedFoodItem | null {
  const name = raw.name.trim();
  if (!name) return null;

  const estimatedGrams = Math.round(clampNonNegative(raw.estimatedGrams));
  if (estimatedGrams <= 0) return null;

  return {
    name,
    estimatedGrams,
    kcal100: round1(clampNonNegative(raw.kcal100)),
    protein100: round1(clampNonNegative(raw.protein100)),
    carbs100: round1(clampNonNegative(raw.carbs100)),
    fat100: round1(clampNonNegative(raw.fat100)),
    confidence: raw.confidence ?? "medium",
  };
}

export function mapAnalyzedItems(
  items: ReadonlyArray<z.infer<typeof foodPhotoItemSchema>>,
): AnalyzedFoodItem[] {
  return items.flatMap((item) => {
    const mapped = mapAnalyzedItem(item);
    return mapped ? [mapped] : [];
  });
}

export function scaleMacros(
  item: Pick<AnalyzedFoodItem, "kcal100" | "protein100" | "carbs100" | "fat100">,
  grams: number,
): { calories: number; protein: number; carbs: number; fat: number } {
  const factor = clampNonNegative(grams) / 100;
  return {
    calories: Math.round(item.kcal100 * factor),
    protein: round1(item.protein100 * factor),
    carbs: round1(item.carbs100 * factor),
    fat: round1(item.fat100 * factor),
  };
}

export function fitWithinMax(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const longest = Math.max(safeWidth, safeHeight);
  if (longest <= maxEdge) return { width: safeWidth, height: safeHeight };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

export function getFoodPhotoErrorMessage(error: unknown): string {
  if (error instanceof FoodPhotoError) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Die Analyse ist fehlgeschlagen. Bitte erneut versuchen.";
}
