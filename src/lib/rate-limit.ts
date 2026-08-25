export const RATE_LIMIT_ACTIONS = {
  off_search: { maxCount: 30, windowSeconds: 60 },
  off_barcode: { maxCount: 30, windowSeconds: 60 },
  food_photo_analyze: { maxCount: 10, windowSeconds: 60 },
  save_gemini_key: { maxCount: 5, windowSeconds: 15 * 60 },
  delete_account: { maxCount: 3, windowSeconds: 15 * 60 },
} as const;

export type RateLimitAction = keyof typeof RATE_LIMIT_ACTIONS;

export const RATE_LIMITED_MESSAGE = "Zu viele Anfragen. Bitte kurz warten und erneut versuchen.";

export class RateLimitError extends Error {
  constructor(message = RATE_LIMITED_MESSAGE) {
    super(message);
    this.name = "RateLimitError";
  }
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}
