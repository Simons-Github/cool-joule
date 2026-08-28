export const STRAVA_SYNC_STALE_MS = 15 * 60 * 1000;
export const STRAVA_BACKFILL_DAYS = 14;
export const STRAVA_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const STRAVA_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
export const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
export const STRAVA_DEAUTHORIZE_URL = "https://www.strava.com/oauth/deauthorize";
export const STRAVA_API_BASE = "https://www.strava.com/api/v3";
export const KJ_PER_KCAL = 4.184;
export const DEFAULT_WEIGHT_KG = 70;
export const MAX_ACTIVITY_NAME_LENGTH = 120;

export type ExerciseSource = "manual" | "strava";

export type StravaStatus = {
  configured: boolean;
  connected: boolean;
  athleteName: string | null;
  lastSyncedAt: string | null;
};

export type StravaSyncResult = {
  configured: boolean;
  connected: boolean;
  skipped: boolean;
  imported: number;
  lastSyncedAt: string | null;
};

export type StravaErrorCode =
  | "UNAUTHENTICATED"
  | "NOT_CONFIGURED"
  | "NOT_CONNECTED"
  | "OAUTH_DENIED"
  | "OAUTH_FAILED"
  | "INVALID_STATE"
  | "SCOPE_MISSING"
  | "ALREADY_CONNECTED"
  | "STORAGE_FAILED"
  | "SYNC_FAILED"
  | "RATE_LIMITED";

export class StravaError extends Error {
  readonly code: StravaErrorCode;

  constructor(code: StravaErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "StravaError";
    this.code = code;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export function getStravaErrorMessage(error: unknown): string {
  if (error instanceof StravaError) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Strava konnte nicht verbunden werden.";
}

export function emptyStravaStatus(configured: boolean): StravaStatus {
  return { configured, connected: false, athleteName: null, lastSyncedAt: null };
}

export const SPORT_LABELS: Record<string, string> = {
  AlpineSki: "Ski alpin",
  BackcountrySki: "Skitour",
  Canoeing: "Kanu",
  Crossfit: "CrossFit",
  EBikeRide: "E-Bike",
  Elliptical: "Crosstrainer",
  Golf: "Golf",
  GravelRide: "Gravel",
  Hike: "Wandern",
  IceSkate: "Eislaufen",
  InlineSkate: "Inliner",
  Kayaking: "Kajak",
  Kitesurf: "Kitesurfen",
  MountainBikeRide: "Mountainbike",
  NordicSki: "Langlauf",
  Ride: "Radfahren",
  RockClimbing: "Klettern",
  RollerSki: "Rollski",
  Rowing: "Rudern",
  Run: "Laufen",
  Sail: "Segeln",
  Skateboard: "Skateboard",
  Snowboard: "Snowboard",
  Snowshoe: "Schneeschuh",
  Soccer: "Fußball",
  StairStepper: "Treppe",
  StandUpPaddling: "SUP",
  Surfing: "Surfen",
  Swim: "Schwimmen",
  TrailRun: "Traillauf",
  Velomobile: "Velomobil",
  VirtualRide: "Virtuelle Ausfahrt",
  VirtualRun: "Virtueller Lauf",
  Walk: "Spazieren",
  WeightTraining: "Krafttraining",
  Wheelchair: "Rollstuhl",
  Windsurf: "Windsurfen",
  Workout: "Training",
  Yoga: "Yoga",
};

const SPORT_MET: Record<string, number> = {
  Run: 9.8,
  TrailRun: 9.8,
  VirtualRun: 9,
  Ride: 8,
  GravelRide: 8,
  MountainBikeRide: 8.5,
  EBikeRide: 6,
  VirtualRide: 7,
  Swim: 8,
  Walk: 3.5,
  Hike: 6,
  WeightTraining: 6,
  Workout: 6,
  Yoga: 3,
  Rowing: 7,
  Crossfit: 8,
  Elliptical: 5.5,
  StairStepper: 9,
  Soccer: 7,
};

export type HmacSigner = (payload: string) => string;

export type OAuthStatePayload = {
  u: string;
  e: number;
};

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function utf8ToBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlToUtf8(value: string): string {
  const padded =
    value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function buildOAuthState(
  userId: string,
  sign: HmacSigner,
  nowMs = Date.now(),
  ttlMs = STRAVA_OAUTH_STATE_TTL_MS,
): string {
  const payload = utf8ToBase64Url(
    JSON.stringify({ u: userId, e: nowMs + ttlMs } satisfies OAuthStatePayload),
  );
  return `${payload}.${sign(payload)}`;
}

export function parseOAuthState(state: string, sign: HmacSigner, nowMs = Date.now()): string {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) {
    throw new StravaError(
      "INVALID_STATE",
      "Die Strava-Anmeldung ist ungültig. Bitte erneut verbinden.",
    );
  }
  const expected = sign(payload);
  if (!timingSafeEqual(signature, expected)) {
    throw new StravaError(
      "INVALID_STATE",
      "Die Strava-Anmeldung ist ungültig. Bitte erneut verbinden.",
    );
  }

  let parsed: OAuthStatePayload;
  try {
    parsed = JSON.parse(base64UrlToUtf8(payload)) as OAuthStatePayload;
  } catch {
    throw new StravaError(
      "INVALID_STATE",
      "Die Strava-Anmeldung ist ungültig. Bitte erneut verbinden.",
    );
  }

  if (typeof parsed.u !== "string" || !parsed.u || typeof parsed.e !== "number") {
    throw new StravaError(
      "INVALID_STATE",
      "Die Strava-Anmeldung ist ungültig. Bitte erneut verbinden.",
    );
  }
  if (parsed.e < nowMs) {
    throw new StravaError(
      "INVALID_STATE",
      "Die Strava-Anmeldung ist abgelaufen. Bitte erneut verbinden.",
    );
  }
  return parsed.u;
}

export function hasActivityReadScope(scope: string | null | undefined): boolean {
  if (!scope) return false;
  const parts = scope.split(/[\s,]+/).map((part) => part.trim());
  return parts.includes("activity:read_all") || parts.includes("activity:read");
}

export function sportLabel(sportType: string | null | undefined, type?: string | null): string {
  const key = sportType?.trim() || type?.trim() || "Workout";
  return SPORT_LABELS[key] ?? "Training";
}

export function activityDisplayName(activity: {
  name?: string | null;
  sport_type?: string | null;
  type?: string | null;
}): string {
  const trimmed = activity.name?.trim();
  if (trimmed) return trimmed.slice(0, MAX_ACTIVITY_NAME_LENGTH);
  return sportLabel(activity.sport_type, activity.type);
}

export function activityDateLocal(startDateLocal: string | null | undefined): string | null {
  if (!startDateLocal) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(startDateLocal);
  return match?.[1] ?? null;
}

export function metForSport(sportType: string | null | undefined, type?: string | null): number {
  const key = sportType?.trim() || type?.trim() || "";
  return SPORT_MET[key] ?? 6;
}

export function resolveActivityCalories(input: {
  calories?: number | null;
  kilojoules?: number | null;
  movingTimeSeconds?: number | null;
  elapsedTimeSeconds?: number | null;
  sportType?: string | null;
  type?: string | null;
  weightKg?: number | null;
}): number {
  if (typeof input.calories === "number" && Number.isFinite(input.calories) && input.calories > 0) {
    return Math.round(input.calories);
  }
  if (
    typeof input.kilojoules === "number" &&
    Number.isFinite(input.kilojoules) &&
    input.kilojoules > 0
  ) {
    return Math.round(input.kilojoules / KJ_PER_KCAL);
  }

  const seconds = input.movingTimeSeconds || input.elapsedTimeSeconds || 0;
  if (seconds <= 0) return 0;
  const hours = seconds / 3600;
  const weight =
    typeof input.weightKg === "number" && Number.isFinite(input.weightKg) && input.weightKg > 0
      ? input.weightKg
      : DEFAULT_WEIGHT_KG;
  return Math.max(0, Math.round(metForSport(input.sportType, input.type) * weight * hours));
}

export type MappedExerciseLog = {
  name: string;
  date: string;
  calories: number;
  source: "strava";
  external_id: string;
};

export type StravaActivityLike = {
  id: number;
  name?: string | null;
  sport_type?: string | null;
  type?: string | null;
  start_date_local?: string | null;
  calories?: number | null;
  kilojoules?: number | null;
  moving_time?: number | null;
  elapsed_time?: number | null;
};

export function mapStravaActivityToLog(
  activity: StravaActivityLike,
  weightKg: number | null,
): MappedExerciseLog | null {
  const date = activityDateLocal(activity.start_date_local);
  if (!date || !Number.isFinite(activity.id)) return null;
  return {
    name: activityDisplayName(activity),
    date,
    calories: resolveActivityCalories({
      calories: activity.calories ?? null,
      kilojoules: activity.kilojoules ?? null,
      movingTimeSeconds: activity.moving_time ?? null,
      elapsedTimeSeconds: activity.elapsed_time ?? null,
      sportType: activity.sport_type ?? null,
      type: activity.type ?? null,
      weightKg,
    }),
    source: "strava",
    external_id: String(activity.id),
  };
}

export function shouldImportActivity(
  externalId: string,
  ignoredExternalIds: Iterable<string>,
): boolean {
  return !new Set(ignoredExternalIds).has(externalId);
}

export function activitiesNeedingImport(
  summaries: Array<{ id: number }>,
  existingExternalIds: Iterable<string>,
  ignoredExternalIds: Iterable<string>,
): number[] {
  const existing = new Set(existingExternalIds);
  const ignored = new Set(ignoredExternalIds);
  const ids: number[] = [];
  for (const summary of summaries) {
    const id = String(summary.id);
    if (ignored.has(id) || existing.has(id)) continue;
    ids.push(summary.id);
  }
  return ids;
}

export function withIgnoredExternalId(
  ignored: string[] | null | undefined,
  externalId: string,
): string[] {
  const next = new Set(ignored ?? []);
  next.add(externalId);
  return Array.from(next);
}

export function isSyncStale(lastSyncedAt: string | null | undefined, nowMs = Date.now()): boolean {
  if (!lastSyncedAt) return true;
  const ts = Date.parse(lastSyncedAt);
  if (!Number.isFinite(ts)) return true;
  return nowMs - ts >= STRAVA_SYNC_STALE_MS;
}

export function unixSecondsAfterDaysAgo(days: number, nowMs = Date.now()): number {
  return Math.floor((nowMs - days * 24 * 60 * 60 * 1000) / 1000);
}

export type StravaWebhookEvent = {
  object_type: "activity" | "athlete";
  object_id: number;
  aspect_type: "create" | "update" | "delete";
  updates?: Record<string, string>;
  owner_id: number;
  subscription_id: number;
  event_time: number;
};

export type StravaWebhookAction =
  | { type: "upsert_activity"; activityId: number; athleteId: number }
  | { type: "delete_activity"; activityId: number; athleteId: number }
  | { type: "disconnect"; athleteId: number }
  | { type: "ignore" };

export function webhookAction(event: StravaWebhookEvent): StravaWebhookAction {
  if (event.object_type === "athlete" && event.updates?.["authorized"] === "false") {
    return { type: "disconnect", athleteId: event.owner_id };
  }
  if (event.object_type === "activity") {
    if (event.aspect_type === "delete") {
      return { type: "delete_activity", activityId: event.object_id, athleteId: event.owner_id };
    }
    if (event.aspect_type === "create" || event.aspect_type === "update") {
      return { type: "upsert_activity", activityId: event.object_id, athleteId: event.owner_id };
    }
  }
  return { type: "ignore" };
}

export type StravaWebhookProbe = "authorized" | "revoked" | "exists" | "missing" | "unavailable";

export type WebhookConnectionDecision = "drop" | "keep" | "retry";
export type WebhookActivityDeleteDecision = "delete" | "ignore" | "retry";
export type StravaWebhookHttpStatus = 200 | 400 | 403 | 429 | 503;

export function webhookSubscriptionIdFromBody(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const value = (body as Record<string, unknown>)["subscription_id"];
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return null;
  return value;
}

export function isWebhookSubscriptionAuthorized(
  eventSubscriptionId: number | null,
  expected: string | undefined,
): boolean {
  const want = expected?.trim();
  if (!want || eventSubscriptionId == null) return false;
  return timingSafeEqual(String(eventSubscriptionId), want);
}

export function requestClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

export function shouldDropConnectionFromWebhook(
  athleteStatus: Extract<StravaWebhookProbe, "authorized" | "revoked" | "unavailable">,
): WebhookConnectionDecision {
  if (athleteStatus === "revoked") return "drop";
  if (athleteStatus === "authorized") return "keep";
  return "retry";
}

export function shouldDeleteLocalActivityFromWebhook(
  activityStatus: Extract<StravaWebhookProbe, "exists" | "missing" | "revoked" | "unavailable">,
): WebhookActivityDeleteDecision {
  if (activityStatus === "missing") return "delete";
  if (activityStatus === "unavailable") return "retry";
  return "ignore";
}

export function parseWebhookEvent(body: unknown): StravaWebhookEvent | null {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  const objectType = value["object_type"];
  const aspectType = value["aspect_type"];
  if (objectType !== "activity" && objectType !== "athlete") return null;
  if (aspectType !== "create" && aspectType !== "update" && aspectType !== "delete") return null;
  if (typeof value["object_id"] !== "number" || typeof value["owner_id"] !== "number") return null;
  const rawUpdates = value["updates"];
  const updates =
    rawUpdates && typeof rawUpdates === "object"
      ? Object.fromEntries(
          Object.entries(rawUpdates as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : null;
  const event: StravaWebhookEvent = {
    object_type: objectType,
    object_id: value["object_id"],
    aspect_type: aspectType,
    owner_id: value["owner_id"],
    subscription_id: typeof value["subscription_id"] === "number" ? value["subscription_id"] : 0,
    event_time: typeof value["event_time"] === "number" ? value["event_time"] : 0,
  };
  if (updates) event.updates = updates;
  return event;
}

export function buildAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(STRAVA_AUTHORIZE_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", "read,activity:read_all");
  url.searchParams.set("state", input.state);
  return url.toString();
}
