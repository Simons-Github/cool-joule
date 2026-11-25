export const SHORTCUT_EXERCISE_PATH = "/api/shortcuts/exercise";
export const SHORTCUT_FILE_PATH = "/shortcuts/cool-joule-workout.shortcut";
export const SHORTCUT_FILE_DOWNLOAD_NAME = "Cool Joule.shortcut";
export const MAX_SHORTCUT_NAME_LENGTH = 120;

export type ShortcutTokenStatus = {
  configured: boolean;
  suffix: string | null;
  token: string | null;
};

export type ShortcutErrorCode =
  | "UNAUTHENTICATED"
  | "NOT_CONFIGURED"
  | "UNAUTHORIZED"
  | "INVALID_PAYLOAD"
  | "STORAGE_FAILED"
  | "RATE_LIMITED";

export class ShortcutError extends Error {
  readonly code: ShortcutErrorCode;

  constructor(code: ShortcutErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "ShortcutError";
    this.code = code;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export function getShortcutErrorMessage(error: unknown): string {
  if (error instanceof ShortcutError) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Der Kurzbefehl-Webhook ist fehlgeschlagen.";
}

export function emptyShortcutTokenStatus(): ShortcutTokenStatus {
  return { configured: false, suffix: null, token: null };
}

export function shortcutTokenSuffix(token: string): string {
  return token.slice(-4);
}

export function buildShortcutWebhookUrl(origin: string, token: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}${SHORTCUT_EXERCISE_PATH}?token=${encodeURIComponent(token)}`;
}

export function buildShortcutFileUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}${SHORTCUT_FILE_PATH}`;
}

export function buildShortcutInstallUrl(origin: string, name = "Cool Joule"): string {
  const params = new URLSearchParams({
    url: buildShortcutFileUrl(origin),
    name,
  });
  return `shortcuts://import-shortcut?${params.toString()}`;
}

export function extractShortcutToken(request: Request): string | null {
  const query = new URL(request.url).searchParams.get("token")?.trim();
  if (query) return query;
  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const bearer = authorization.slice("bearer ".length).trim();
    if (bearer) return bearer;
  }
  return request.headers.get("x-shortcut-token")?.trim() || null;
}

export function parseCaloriesInput(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(",", ".");
  const match = /(\d+(?:\.\d+)?)/.exec(normalized);
  if (!match) return null;
  const kcal = Number(match[1]);
  if (!Number.isFinite(kcal) || kcal < 0) return null;
  return Math.round(kcal);
}

export function parseShortcutDate(value: unknown, fallback: string): string | null {
  if (value == null || value === "") return fallback;
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match?.[1] ?? null;
}

function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstUnknown(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return undefined;
}

export type ParsedShortcutExercise = {
  name: string;
  calories: number;
  date: string;
  externalId: string | null;
};

export function parseShortcutExercisePayload(
  body: unknown,
  fallbackDate: string,
): ParsedShortcutExercise {
  if (!body || typeof body !== "object") {
    throw new ShortcutError("INVALID_PAYLOAD", "Bitte JSON mit name und calories senden.");
  }
  const record = body as Record<string, unknown>;
  const rawName = firstString(record, ["name", "titel", "title", "activity", "workout"]);
  const calories = parseCaloriesInput(
    firstUnknown(record, ["calories", "kcal", "activeEnergy", "active_energy", "kalorien"]),
  );
  if (calories == null) {
    throw new ShortcutError("INVALID_PAYLOAD", "Bitte gültige Kalorien senden (Feld calories).");
  }
  const date = parseShortcutDate(firstUnknown(record, ["date", "datum", "day"]), fallbackDate);
  if (!date) {
    throw new ShortcutError("INVALID_PAYLOAD", "Datum muss YYYY-MM-DD sein.");
  }
  const rawId = firstString(record, ["id", "uuid", "workoutId", "workout_id"]);
  return {
    name: (rawName ?? "Training").slice(0, MAX_SHORTCUT_NAME_LENGTH),
    calories,
    date,
    externalId: rawId ? rawId.slice(0, 120) : null,
  };
}

export async function parseShortcutRequestBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await request.text();
    return Object.fromEntries(new URLSearchParams(text).entries());
  }
  try {
    return await request.json();
  } catch {
    throw new ShortcutError("INVALID_PAYLOAD", "Der Body muss JSON oder ein Formular sein.");
  }
}
