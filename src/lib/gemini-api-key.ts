export type GeminiKeyStatus = {
  configured: boolean;
  suffix: string | null;
};

export type GeminiKeyErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_KEY"
  | "VERIFY_FAILED"
  | "NOT_CONFIGURED"
  | "STORAGE_FAILED"
  | "RATE_LIMITED";

export class GeminiKeyError extends Error {
  readonly code: GeminiKeyErrorCode;

  constructor(code: GeminiKeyErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "GeminiKeyError";
    this.code = code;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

const GEMINI_API_KEY_PATTERN = /^[A-Za-z0-9._~-]{20,200}$/;

/** Returns a German error message, or null if the key looks structurally valid. */
export function validateGeminiApiKey(value: string): string | null {
  const key = value.trim();
  if (!key) return "Bitte einen API-Key eingeben.";
  if (/\s/.test(key)) return "Der API-Key darf keine Leerzeichen enthalten.";
  if (key.length < 20) return "Der API-Key ist zu kurz.";
  if (key.length > 200) return "Der API-Key ist zu lang.";
  if (!GEMINI_API_KEY_PATTERN.test(key)) {
    return "Der API-Key enthält ungültige Zeichen.";
  }
  return null;
}

export function normalizeGeminiApiKey(value: unknown): string {
  if (typeof value !== "string") {
    throw new GeminiKeyError("INVALID_KEY", "Bitte einen API-Key eingeben.");
  }
  const key = value.trim();
  const error = validateGeminiApiKey(key);
  if (error) throw new GeminiKeyError("INVALID_KEY", error);
  return key;
}

export function geminiKeySuffix(key: string): string {
  return key.slice(-4);
}

export function toGeminiKeyStatus(row: { key_suffix: string } | null): GeminiKeyStatus {
  if (!row) return { configured: false, suffix: null };
  return { configured: true, suffix: row.key_suffix };
}

export function getGeminiKeyErrorMessage(error: unknown): string {
  if (error instanceof GeminiKeyError) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Der API-Key konnte nicht gespeichert werden.";
}
