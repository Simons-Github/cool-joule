import { translate, type Lang } from "@/lib/i18n";

/**
 * Demo mode = a Supabase anonymous user (`signInAnonymously`). Each visitor gets
 * an isolated sandbox through the normal per-user RLS policies. Features that
 * spend shared money or link external accounts are switched off for them, both
 * in the UI and in the server functions.
 */

/** German text thrown by server functions (not localized yet); kept stable. */
export const DEMO_FEATURE_DISABLED_MESSAGE =
  "Im Demo-Modus nicht verfügbar. Erstelle ein eigenes Konto, um diese Funktion zu nutzen.";

export class DemoModeError extends Error {
  readonly code = "DEMO_MODE" as const;

  constructor(message = DEMO_FEATURE_DISABLED_MESSAGE) {
    super(message);
    this.name = "DemoModeError";
  }
}

/** Accepts a Supabase `User` (or the stored session user) and tolerates missing fields. */
export function isDemoUser(user: { is_anonymous?: boolean | null } | null | undefined): boolean {
  return user?.is_anonymous === true;
}

export function assertNotDemoUser(user: { isAnonymous: boolean }, message?: string): void {
  if (user.isAnonymous) throw new DemoModeError(message);
}

export function getDemoStartErrorMessage(
  error: { code?: string | undefined } | null,
  lang: Lang = "de",
): string {
  if (error?.code === "anonymous_provider_disabled") {
    return translate(lang, "demo.start.providerDisabled");
  }
  if (error?.code === "over_request_rate_limit" || error?.code === "over_email_send_rate_limit") {
    return translate(lang, "demo.start.rateLimited");
  }
  return translate(lang, "demo.start.failed");
}
