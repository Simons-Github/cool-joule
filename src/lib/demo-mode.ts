/**
 * Demo mode = a Supabase anonymous user (`signInAnonymously`). Each visitor gets
 * an isolated sandbox through the normal per-user RLS policies. Features that
 * spend shared money or link external accounts are switched off for them, both
 * in the UI and in the server functions.
 */

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

export function getDemoStartErrorMessage(error: { code?: string | undefined } | null): string {
  if (error?.code === "anonymous_provider_disabled") {
    return "Der Demo-Modus ist gerade nicht verfügbar. Bitte melde dich an oder erstelle ein Konto.";
  }
  if (error?.code === "over_request_rate_limit" || error?.code === "over_email_send_rate_limit") {
    return "Gerade starten sehr viele Demos. Bitte versuche es in ein paar Minuten erneut.";
  }
  return "Die Demo konnte nicht gestartet werden. Bitte später erneut versuchen.";
}
