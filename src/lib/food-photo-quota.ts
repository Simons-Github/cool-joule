export const foodPhotoQuotaQueryKey = ["food-photo-quota"] as const;

export const SERVER_KEY_PHOTO_LIMIT = 1;
export const SERVER_KEY_PHOTO_WINDOW_MS = 24 * 60 * 60 * 1000;

export type FoodPhotoQuota =
  | { limited: false }
  | {
      limited: true;
      remaining: number;
      resetsAt: string | null;
    };

export function serverKeyQuotaResetsAt(lastUsedAt: Date): Date {
  return new Date(lastUsedAt.getTime() + SERVER_KEY_PHOTO_WINDOW_MS);
}

export function isServerKeyQuotaAvailable(lastUsedAt: Date | null, now = new Date()): boolean {
  if (!lastUsedAt) return true;
  return now.getTime() >= serverKeyQuotaResetsAt(lastUsedAt).getTime();
}

export function toLimitedFoodPhotoQuota(
  lastUsedAt: Date | null,
  now = new Date(),
): Extract<FoodPhotoQuota, { limited: true }> {
  if (!lastUsedAt || isServerKeyQuotaAvailable(lastUsedAt, now)) {
    return { limited: true, remaining: SERVER_KEY_PHOTO_LIMIT, resetsAt: null };
  }
  return {
    limited: true,
    remaining: 0,
    resetsAt: serverKeyQuotaResetsAt(lastUsedAt).toISOString(),
  };
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
  return `Ohne eigenen API-Key ist nur 1 Fotoanalyse pro 24 Stunden möglich. Nächste Analyse ab ${formatQuotaReset(iso)}. Hinterlege im Profil einen eigenen Gemini-Key für unbegrenzte Analysen.`;
}

export function isFoodPhotoQuotaBlocked(quota: FoodPhotoQuota | undefined): boolean {
  return Boolean(quota?.limited && quota.remaining <= 0);
}
