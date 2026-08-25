import { createHash, randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret, parseEncryptionKey } from "@/lib/secret-box";
import { RateLimitError } from "@/lib/rate-limit";
import { logServerError } from "@/lib/server-auth";
import { todayISO } from "@/lib/nutrition";
import {
  ShortcutError,
  emptyShortcutTokenStatus,
  parseShortcutExercisePayload,
  parseShortcutRequestBody,
  shortcutTokenSuffix,
  type ParsedShortcutExercise,
  type ShortcutTokenStatus,
} from "@/lib/shortcut";

const AUTH_MESSAGE = "Bitte anmelden, um den Kurzbefehl-Webhook zu verwalten.";

export function hashShortcutToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateShortcutToken(): string {
  return `cj_${randomBytes(24).toString("base64url")}`;
}

function getEncryptionKey(): Buffer {
  const raw = process.env["USER_SECRETS_ENCRYPTION_KEY"];
  if (!raw?.trim()) {
    throw new ShortcutError(
      "NOT_CONFIGURED",
      "Schlüssel-Speicherung ist nicht konfiguriert. Bitte USER_SECRETS_ENCRYPTION_KEY setzen.",
    );
  }
  try {
    return parseEncryptionKey(raw);
  } catch {
    throw new ShortcutError(
      "NOT_CONFIGURED",
      "USER_SECRETS_ENCRYPTION_KEY ist ungültig. Es müssen 32 Byte als Base64 sein.",
    );
  }
}

async function getAdmin() {
  try {
    const { createSupabaseAdmin } = await import("@/integrations/supabase/admin.server");
    return createSupabaseAdmin();
  } catch (error) {
    throw new ShortcutError(
      "NOT_CONFIGURED",
      error instanceof Error
        ? error.message
        : "Server-Konfiguration unvollständig. Bitte SUPABASE_SECRET_KEY setzen.",
    );
  }
}

async function requireUserId(): Promise<string> {
  const { requireAuthenticatedUserId } = await import("@/lib/server-auth");
  try {
    return await requireAuthenticatedUserId(AUTH_MESSAGE);
  } catch (error) {
    if (error instanceof Error && error.message === AUTH_MESSAGE) {
      throw new ShortcutError("UNAUTHENTICATED", AUTH_MESSAGE);
    }
    throw error;
  }
}

async function enforceShortcutLimit(
  userId: string,
  action: "shortcut_token" | "shortcut_ingest",
): Promise<void> {
  const { enforceRateLimit } = await import("@/lib/rate-limit.server");
  try {
    await enforceRateLimit(userId, action);
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw new ShortcutError("RATE_LIMITED", error.message);
    }
    throw error;
  }
}

export async function getShortcutTokenStatus(): Promise<ShortcutTokenStatus> {
  const userId = await requireUserId();
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("shortcut_tokens")
    .select("token_ciphertext, token_suffix")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    logServerError(error);
    throw new ShortcutError("STORAGE_FAILED", "Der Webhook-Status konnte nicht geladen werden.");
  }
  if (!data) return emptyShortcutTokenStatus();
  try {
    return {
      configured: true,
      suffix: data.token_suffix,
      token: decryptSecret(data.token_ciphertext, getEncryptionKey()),
    };
  } catch {
    throw new ShortcutError(
      "STORAGE_FAILED",
      "Der Webhook-Token konnte nicht gelesen werden. Bitte neu erzeugen.",
    );
  }
}

export async function createShortcutToken(): Promise<ShortcutTokenStatus> {
  const userId = await requireUserId();
  await enforceShortcutLimit(userId, "shortcut_token");
  const admin = await getAdmin();
  const token = generateShortcutToken();
  const { error } = await admin.from("shortcut_tokens").upsert({
    user_id: userId,
    token_hash: hashShortcutToken(token),
    token_ciphertext: encryptSecret(token, getEncryptionKey()),
    token_suffix: shortcutTokenSuffix(token),
    updated_at: new Date().toISOString(),
  });
  if (error) {
    logServerError(error);
    throw new ShortcutError("STORAGE_FAILED", "Der Webhook-Token konnte nicht gespeichert werden.");
  }
  return { configured: true, suffix: shortcutTokenSuffix(token), token };
}

export async function deleteShortcutToken(): Promise<ShortcutTokenStatus> {
  const userId = await requireUserId();
  const admin = await getAdmin();
  const { error } = await admin.from("shortcut_tokens").delete().eq("user_id", userId);
  if (error) {
    logServerError(error);
    throw new ShortcutError("STORAGE_FAILED", "Der Webhook-Token konnte nicht entfernt werden.");
  }
  return emptyShortcutTokenStatus();
}

async function lookupUserByToken(token: string): Promise<string | null> {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("shortcut_tokens")
    .select("user_id")
    .eq("token_hash", hashShortcutToken(token))
    .maybeSingle();
  if (error) {
    logServerError(error);
    throw new ShortcutError("STORAGE_FAILED", "Der Webhook-Token konnte nicht geprüft werden.");
  }
  return data?.user_id ?? null;
}

async function insertShortcutExercise(
  userId: string,
  payload: ParsedShortcutExercise,
): Promise<{ duplicate: boolean }> {
  const admin = await getAdmin();
  if (payload.externalId) {
    const { data: existing, error: lookupError } = await admin
      .from("exercise_logs")
      .select("id")
      .eq("user_id", userId)
      .eq("source", "shortcut")
      .eq("external_id", payload.externalId)
      .maybeSingle();
    if (lookupError) {
      logServerError(lookupError);
      throw new ShortcutError("STORAGE_FAILED", "Die Aktivität konnte nicht gespeichert werden.");
    }
    if (existing?.id) {
      const { error } = await admin
        .from("exercise_logs")
        .update({ name: payload.name, calories: payload.calories, date: payload.date })
        .eq("id", existing.id)
        .eq("user_id", userId);
      if (error) {
        logServerError(error);
        throw new ShortcutError("STORAGE_FAILED", "Die Aktivität konnte nicht gespeichert werden.");
      }
      return { duplicate: true };
    }
  }

  const row: {
    user_id: string;
    date: string;
    name: string;
    calories: number;
    source: "shortcut";
    external_id?: string;
  } = {
    user_id: userId,
    date: payload.date,
    name: payload.name,
    calories: payload.calories,
    source: "shortcut",
  };
  if (payload.externalId) row.external_id = payload.externalId;

  const { error } = await admin.from("exercise_logs").insert(row);
  if (error) {
    if (error.code === "23505") return { duplicate: true };
    logServerError(error);
    throw new ShortcutError("STORAGE_FAILED", "Die Aktivität konnte nicht gespeichert werden.");
  }
  return { duplicate: false };
}

export type ShortcutIngestResult = ParsedShortcutExercise & { duplicate: boolean };

export async function ingestShortcutExercise(
  token: string,
  body: unknown,
): Promise<ShortcutIngestResult> {
  const userId = await lookupUserByToken(token);
  if (!userId) {
    throw new ShortcutError("UNAUTHORIZED", "Ungültiger Webhook-Token.");
  }
  await enforceShortcutLimit(userId, "shortcut_ingest");
  const payload = parseShortcutExercisePayload(body, todayISO());
  const { duplicate } = await insertShortcutExercise(userId, payload);
  return { ...payload, duplicate };
}

export async function ingestShortcutRequest(request: Request): Promise<ShortcutIngestResult> {
  const { extractShortcutToken } = await import("@/lib/shortcut");
  const token = extractShortcutToken(request);
  if (!token) {
    throw new ShortcutError(
      "UNAUTHORIZED",
      "Token fehlt. Hänge ?token=… an die URL oder sende Authorization: Bearer.",
    );
  }
  const body = await parseShortcutRequestBody(request);
  return ingestShortcutExercise(token, body);
}

export function shortcutHttpStatus(error: ShortcutError): number {
  if (error.code === "UNAUTHORIZED" || error.code === "UNAUTHENTICATED") return 401;
  if (error.code === "INVALID_PAYLOAD") return 400;
  if (error.code === "RATE_LIMITED") return 429;
  if (error.code === "NOT_CONFIGURED") return 503;
  return 500;
}
