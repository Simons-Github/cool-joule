export const foodPhotoQuotaQueryKey = ["food-photo-quota"] as const;

export const SERVER_KEY_PHOTO_LIMIT = 5;
export const SERVER_KEY_PHOTO_WINDOW_MS = 24 * 60 * 60 * 1000;

export type FoodPhotoQuota =
  | { limited: false }
  | {
      limited: true;
      remaining: number;
      resetsAt: string | null;
      requiresOwnKey?: boolean;
    };

export type ServerKeyPhotoUsage = {
  windowStartedAt: Date;
  useCount: number;
};

export function serverKeyQuotaResetsAt(windowStartedAt: Date): Date {
  return new Date(windowStartedAt.getTime() + SERVER_KEY_PHOTO_WINDOW_MS);
}

export function remainingServerKeyQuota(
  usage: ServerKeyPhotoUsage | null,
  now = new Date(),
): number {
  if (!usage) return SERVER_KEY_PHOTO_LIMIT;
  if (now.getTime() >= serverKeyQuotaResetsAt(usage.windowStartedAt).getTime()) {
    return SERVER_KEY_PHOTO_LIMIT;
  }
  return Math.max(0, SERVER_KEY_PHOTO_LIMIT - usage.useCount);
}

export function isServerKeyQuotaAvailable(
  usage: ServerKeyPhotoUsage | null,
  now = new Date(),
): boolean {
  return remainingServerKeyQuota(usage, now) > 0;
}

export function toLimitedFoodPhotoQuota(
  usage: ServerKeyPhotoUsage | null,
  now = new Date(),
): Extract<FoodPhotoQuota, { limited: true }> {
  const remaining = remainingServerKeyQuota(usage, now);
  if (remaining > 0) {
    return { limited: true, remaining, resetsAt: null };
  }
  return {
    limited: true,
    remaining: 0,
    resetsAt: serverKeyQuotaResetsAt(usage!.windowStartedAt).toISOString(),
  };
}

export function ownKeyRequiredQuota(): Extract<FoodPhotoQuota, { limited: true }> {
  return { limited: true, remaining: 0, resetsAt: null, requiresOwnKey: true };
}

export function formatQuotaReset(iso: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function getServerKeyQuotaExceededMessage(resetsAt: Date | string): string {
  const iso = typeof resetsAt === "string" ? resetsAt : resetsAt.toISOString();
  return `Ohne eigenen API-Key sind nur ${SERVER_KEY_PHOTO_LIMIT} Fotoanalysen pro 24 Stunden möglich. Nächste Analyse ab ${formatQuotaReset(iso)}. Hinterlege im Profil einen eigenen Gemini-Key für unbegrenzte Analysen.`;
}

export const OWN_KEY_REQUIRED_MESSAGE =
  "Die Fotoanalyse ohne eigenen API-Key ist nur für freigeschaltete Accounts verfügbar. Hinterlege im Profil einen eigenen Gemini-Key.";

export function isFoodPhotoQuotaBlocked(quota: FoodPhotoQuota | undefined): boolean {
  return Boolean(quota?.limited && quota.remaining <= 0);
}
