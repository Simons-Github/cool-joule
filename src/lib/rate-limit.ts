export const RATE_LIMIT_ACTIONS = {
  off_search: { maxCount: 30, windowSeconds: 60 },
  off_barcode: { maxCount: 30, windowSeconds: 60 },
  food_photo_analyze: { maxCount: 10, windowSeconds: 60 },
  save_gemini_key: { maxCount: 5, windowSeconds: 15 * 60 },
  delete_account: { maxCount: 3, windowSeconds: 15 * 60 },
  strava_connect: { maxCount: 8, windowSeconds: 15 * 60 },
  strava_sync: { maxCount: 12, windowSeconds: 15 * 60 },
  strava_webhook: { maxCount: 30, windowSeconds: 60 },
  shortcut_token: { maxCount: 8, windowSeconds: 15 * 60 },
  shortcut_ingest: { maxCount: 30, windowSeconds: 15 * 60 },
} as const;

/** Public webhook POSTs, keyed by client IP (in-memory; per instance). */
export const STRAVA_WEBHOOK_IP_LIMIT = { maxCount: 60, windowSeconds: 60 } as const;

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

export type FixedWindowEntry = {
  startedAt: number;
  count: number;
};

/** Fixed-window counter. Returns true when the request is still allowed. */
export function claimFixedWindow(
  store: Map<string, FixedWindowEntry>,
  key: string,
  maxCount: number,
  windowSeconds: number,
  now = Date.now(),
  maxKeys = 4_000,
): boolean {
  const windowMs = windowSeconds * 1000;
  if (store.size >= maxKeys) {
    for (const [storedKey, entry] of store) {
      if (now - entry.startedAt >= windowMs) store.delete(storedKey);
    }
    if (store.size >= maxKeys) store.clear();
  }

  const current = store.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    store.set(key, { startedAt: now, count: 1 });
    return maxCount >= 1;
  }

  current.count += 1;
  return current.count <= maxCount;
}
