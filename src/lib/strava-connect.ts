import { createServerFn } from "@tanstack/react-start";
import { StravaError, type StravaStatus, type StravaSyncResult } from "@/lib/strava";

function requireNonEmptyString(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new StravaError("OAUTH_FAILED", message);
  }
  return value.trim();
}

export const getStravaStatus = createServerFn({ method: "POST" }).handler(
  async (): Promise<StravaStatus> => {
    const { getStravaStatus: load } = await import("@/lib/strava.server");
    return load();
  },
);

export const startStravaConnect = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ url: string }> => {
    const { startStravaConnect: start } = await import("@/lib/strava.server");
    return start();
  },
);

export const completeStravaConnect = createServerFn({ method: "POST" })
  .validator((data: { code: string; state: string; scope?: string }) => {
    const code = requireNonEmptyString(data?.code, "Der Strava-Code fehlt.");
    const state = requireNonEmptyString(data?.state, "Der Strava-State fehlt.");
    if (typeof data?.scope === "string" && data.scope.trim()) {
      return { code, state, scope: data.scope };
    }
    return { code, state };
  })
  .handler(async ({ data }): Promise<StravaStatus> => {
    const { completeStravaConnect: complete } = await import("@/lib/strava.server");
    return complete(data);
  });

export const syncStravaActivities = createServerFn({ method: "POST" })
  .validator((data: { force?: boolean } | undefined) => ({ force: Boolean(data?.force) }))
  .handler(async ({ data }): Promise<StravaSyncResult> => {
    const { syncStravaActivities: sync } = await import("@/lib/strava.server");
    return sync(data.force);
  });

export const disconnectStrava = createServerFn({ method: "POST" }).handler(
  async (): Promise<StravaStatus> => {
    const { disconnectStrava: disconnect } = await import("@/lib/strava.server");
    return disconnect();
  },
);

export const ignoreStravaActivity = createServerFn({ method: "POST" })
  .validator((data: { externalId: string }) => ({
    externalId: requireNonEmptyString(data?.externalId, "Die Aktivität fehlt."),
  }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { ignoreStravaActivity: ignore } = await import("@/lib/strava.server");
    await ignore(data.externalId);
    return { ok: true };
  });
