import {
  GeminiKeyError,
  geminiKeySuffix,
  toGeminiKeyStatus,
  type GeminiKeyStatus,
} from "@/lib/gemini-api-key";
import { decryptSecret, encryptSecret, parseEncryptionKey } from "@/lib/secret-box";
import { logServerError } from "@/lib/server-auth";

const AUTH_MESSAGE = "Bitte anmelden, um den API-Key zu verwalten.";

function getEncryptionKey(): Buffer {
  const raw = process.env["USER_SECRETS_ENCRYPTION_KEY"];
  if (!raw?.trim()) {
    throw new GeminiKeyError(
      "NOT_CONFIGURED",
      "Schlüssel-Speicherung ist nicht konfiguriert. Bitte USER_SECRETS_ENCRYPTION_KEY setzen.",
    );
  }
  try {
    return parseEncryptionKey(raw);
  } catch {
    throw new GeminiKeyError(
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
    throw new GeminiKeyError(
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
      throw new GeminiKeyError("UNAUTHENTICATED", AUTH_MESSAGE);
    }
    throw error;
  }
}

async function verifyGeminiApiKey(apiKey: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
      method: "GET",
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new GeminiKeyError(
      "VERIFY_FAILED",
      "Der API-Key konnte nicht geprüft werden. Bitte später erneut versuchen.",
    );
  }

  if (response.ok) return;

  if (response.status === 400 || response.status === 401 || response.status === 403) {
    throw new GeminiKeyError(
      "INVALID_KEY",
      "Der API-Key wurde von Google abgelehnt. Bitte prüfe ihn in Google AI Studio.",
    );
  }

  throw new GeminiKeyError(
    "VERIFY_FAILED",
    "Der API-Key konnte nicht geprüft werden. Bitte später erneut versuchen.",
  );
}

export async function getUserGeminiKeyStatus(): Promise<GeminiKeyStatus> {
  const userId = await requireUserId();
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("user_gemini_keys")
    .select("key_suffix")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    logServerError(error);
    throw new GeminiKeyError("STORAGE_FAILED", "Der Key-Status konnte nicht geladen werden.");
  }

  return toGeminiKeyStatus(data);
}

export async function saveUserGeminiApiKey(apiKey: string): Promise<GeminiKeyStatus> {
  const userId = await requireUserId();
  const { enforceRateLimit } = await import("@/lib/rate-limit.server");
  const { RateLimitError } = await import("@/lib/rate-limit");
  try {
    await enforceRateLimit(userId, "save_gemini_key");
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw new GeminiKeyError("RATE_LIMITED", error.message);
    }
    throw error;
  }
  const admin = await getAdmin();
  const encryptionKey = getEncryptionKey();
  await verifyGeminiApiKey(apiKey);

  const ciphertext = encryptSecret(apiKey, encryptionKey);
  const suffix = geminiKeySuffix(apiKey);
  const { error } = await admin.from("user_gemini_keys").upsert({
    user_id: userId,
    ciphertext,
    key_suffix: suffix,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    logServerError(error);
    throw new GeminiKeyError("STORAGE_FAILED", "Der API-Key konnte nicht gespeichert werden.");
  }

  return { configured: true, suffix };
}

export async function deleteUserGeminiApiKey(): Promise<GeminiKeyStatus> {
  const userId = await requireUserId();
  const admin = await getAdmin();
  const { error } = await admin.from("user_gemini_keys").delete().eq("user_id", userId);

  if (error) {
    logServerError(error);
    throw new GeminiKeyError("STORAGE_FAILED", "Der API-Key konnte nicht entfernt werden.");
  }

  return { configured: false, suffix: null };
}

export async function loadDecryptedUserGeminiApiKey(userId: string): Promise<string | null> {
  let admin;
  try {
    const { createSupabaseAdmin } = await import("@/integrations/supabase/admin.server");
    admin = createSupabaseAdmin();
  } catch {
    return null;
  }

  const { data, error } = await admin
    .from("user_gemini_keys")
    .select("ciphertext")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    logServerError(error);
    throw new Error("Der hinterlegte API-Key konnte nicht geladen werden.");
  }

  if (!data?.ciphertext) return null;

  try {
    return decryptSecret(data.ciphertext, getEncryptionKey());
  } catch {
    throw new Error(
      "Dein hinterlegter API-Key konnte nicht gelesen werden. Bitte speichere ihn im Profil neu.",
    );
  }
}
