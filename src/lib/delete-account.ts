import { createServerFn } from "@tanstack/react-start";
import { RateLimitError } from "@/lib/rate-limit";

const AUTH_MESSAGE = "Bitte anmelden, um das Konto zu löschen.";
const DELETE_FAILED = "Das Konto konnte nicht gelöscht werden. Bitte später erneut versuchen.";

export const deleteAccount = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: true }> => {
    const { requireAuthenticatedUserId, logServerError } = await import("@/lib/server-auth");
    const { enforceRateLimit } = await import("@/lib/rate-limit.server");

    let userId: string;
    try {
      userId = await requireAuthenticatedUserId(AUTH_MESSAGE);
    } catch (error) {
      if (error instanceof Error && error.message === AUTH_MESSAGE) {
        throw new Error(AUTH_MESSAGE);
      }
      throw error;
    }

    try {
      await enforceRateLimit(userId, "delete_account");
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
      throw error;
    }

    try {
      const { createSupabaseAdmin } = await import("@/integrations/supabase/admin.server");
      const admin = createSupabaseAdmin();
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) {
        logServerError(error);
        throw new Error(DELETE_FAILED);
      }
    } catch (error) {
      if (error instanceof Error && error.message === DELETE_FAILED) throw error;
      const { logServerError } = await import("@/lib/server-auth");
      logServerError(error);
      throw new Error(DELETE_FAILED);
    }

    return { ok: true };
  },
);
