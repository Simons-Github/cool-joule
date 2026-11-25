import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  STRAVA_SYNC_STALE_MS,
  activitiesNeedingImport,
  activityDateLocal,
  activityDisplayName,
  buildAuthorizeUrl,
  buildOAuthState,
  emptyStravaStatus,
  hasActivityReadScope,
  isSyncStale,
  mapStravaActivityToLog,
  parseOAuthState,
  parseWebhookEvent,
  requestClientIp,
  resolveActivityCalories,
  shouldDeleteLocalActivityFromWebhook,
  shouldDropConnectionFromWebhook,
  shouldImportActivity,
  sportLabel,
  unixSecondsAfterDaysAgo,
  webhookAction,
  webhookSubscriptionIdFromBody,
  withIgnoredExternalId,
  isWebhookSubscriptionAuthorized,
} from "./strava";

const KEY = Buffer.from("test-strava-hmac-secret-key-32b!");
const sign = (payload: string) => createHmac("sha256", KEY).update(payload).digest("base64url");

describe("activity mapping", () => {
  it("uses the Strava title and local calendar date", () => {
    expect(
      mapStravaActivityToLog(
        {
          id: 42,
          name: "  Morgenlauf  ",
          sport_type: "Run",
          start_date_local: "2026-08-25T07:15:00Z",
          calories: 380,
          moving_time: 2400,
        },
        70,
      ),
    ).toEqual({
      name: "Morgenlauf",
      date: "2026-08-25",
      calories: 380,
      source: "strava",
      external_id: "42",
    });
  });

  it("falls back to a German sport label", () => {
    expect(sportLabel("Run")).toBe("Laufen");
    expect(activityDisplayName({ sport_type: "Ride" })).toBe("Radfahren");
    expect(activityDisplayName({ name: "", type: "Workout" })).toBe("Training");
  });

  it("reads YYYY-MM-DD from start_date_local even with a trailing Z", () => {
    expect(activityDateLocal("2026-08-25T18:30:00")).toBe("2026-08-25");
    expect(activityDateLocal("2026-08-25T18:30:00Z")).toBe("2026-08-25");
    expect(activityDateLocal("nope")).toBeNull();
  });

  it("prefers calories, then kilojoules, then MET estimate", () => {
    expect(resolveActivityCalories({ calories: 412.4 })).toBe(412);
    expect(resolveActivityCalories({ kilojoules: 418.4 })).toBe(100);
    expect(
      resolveActivityCalories({
        sportType: "Run",
        movingTimeSeconds: 3600,
        weightKg: 70,
      }),
    ).toBe(686);
    expect(resolveActivityCalories({ elapsedTimeSeconds: 0 })).toBe(0);
  });
});

describe("dedup and ignore", () => {
  it("skips ignored and already imported activities", () => {
    expect(shouldImportActivity("9", ["9"])).toBe(false);
    expect(shouldImportActivity("9", ["8"])).toBe(true);
    expect(activitiesNeedingImport([{ id: 1 }, { id: 2 }, { id: 3 }], ["2"], ["3"])).toEqual([1]);
  });

  it("appends ignored ids without duplicates", () => {
    expect(withIgnoredExternalId(["1"], "1")).toEqual(["1"]);
    expect(withIgnoredExternalId(null, "7").sort()).toEqual(["7"]);
  });
});

describe("oauth state", () => {
  it("round-trips a user id", () => {
    const now = 1_700_000_000_000;
    const state = buildOAuthState("user-123", sign, now);
    expect(parseOAuthState(state, sign, now + 1000)).toBe("user-123");
  });

  it("rejects expired, tampered, or truncated state", () => {
    const now = 1_700_000_000_000;
    const state = buildOAuthState("user-123", sign, now, 1000);
    expect(() => parseOAuthState(state, sign, now + 2000)).toThrow(/abgelaufen/);
    expect(() => parseOAuthState(state.slice(0, -2) + "xx", sign, now)).toThrow(/ungültig/);
    expect(() => parseOAuthState("noperiod", sign, now)).toThrow(/ungültig/);
  });

  it("builds an authorize URL with activity:read_all", () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: "123",
        redirectUri: "http://localhost:5173/strava/callback",
        state: "abc",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://www.strava.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("123");
    expect(url.searchParams.get("scope")).toBe("read,activity:read_all");
    expect(url.searchParams.get("state")).toBe("abc");
  });

  it("accepts activity read scopes", () => {
    expect(hasActivityReadScope("read,activity:read_all")).toBe(true);
    expect(hasActivityReadScope("activity:read")).toBe(true);
    expect(hasActivityReadScope("read")).toBe(false);
  });
});

describe("sync staleness", () => {
  it("is stale without a timestamp or after 15 minutes", () => {
    const now = 1_700_000_000_000;
    expect(isSyncStale(null, now)).toBe(true);
    expect(isSyncStale(new Date(now - STRAVA_SYNC_STALE_MS + 1000).toISOString(), now)).toBe(false);
    expect(isSyncStale(new Date(now - STRAVA_SYNC_STALE_MS).toISOString(), now)).toBe(true);
  });

  it("computes the unix after timestamp for the backfill window", () => {
    expect(unixSecondsAfterDaysAgo(14, 1_700_000_000_000)).toBe(
      Math.floor((1_700_000_000_000 - 14 * 24 * 60 * 60 * 1000) / 1000),
    );
  });
});

describe("webhook events", () => {
  it("maps create/update/delete and deauthorization", () => {
    expect(
      webhookAction({
        object_type: "activity",
        object_id: 10,
        aspect_type: "create",
        owner_id: 5,
        subscription_id: 1,
        event_time: 1,
      }),
    ).toEqual({ type: "upsert_activity", activityId: 10, athleteId: 5 });

    expect(
      webhookAction({
        object_type: "activity",
        object_id: 10,
        aspect_type: "delete",
        owner_id: 5,
        subscription_id: 1,
        event_time: 1,
      }),
    ).toEqual({ type: "delete_activity", activityId: 10, athleteId: 5 });

    expect(
      webhookAction({
        object_type: "athlete",
        object_id: 5,
        aspect_type: "update",
        updates: { authorized: "false" },
        owner_id: 5,
        subscription_id: 1,
        event_time: 1,
      }),
    ).toEqual({ type: "disconnect", athleteId: 5 });
  });

  it("parses a valid payload and rejects junk", () => {
    expect(
      parseWebhookEvent({
        object_type: "activity",
        object_id: 99,
        aspect_type: "update",
        owner_id: 3,
        subscription_id: 8,
        event_time: 12,
        updates: { title: "Neu" },
      }),
    ).toMatchObject({ object_id: 99, owner_id: 3, aspect_type: "update" });
    expect(parseWebhookEvent({ object_type: "nope" })).toBeNull();
    expect(emptyStravaStatus(true)).toEqual({
      configured: true,
      connected: false,
      athleteName: null,
      lastSyncedAt: null,
    });
  });

  it("rejects missing, zero, or mismatched subscription ids (fail-closed)", () => {
    expect(webhookSubscriptionIdFromBody({ subscription_id: 42 })).toBe(42);
    expect(webhookSubscriptionIdFromBody({ subscription_id: 0 })).toBeNull();
    expect(webhookSubscriptionIdFromBody({ subscription_id: "42" })).toBeNull();
    expect(webhookSubscriptionIdFromBody(null)).toBeNull();
    expect(isWebhookSubscriptionAuthorized(42, undefined)).toBe(false);
    expect(isWebhookSubscriptionAuthorized(42, "  ")).toBe(false);
    expect(isWebhookSubscriptionAuthorized(null, "42")).toBe(false);
    expect(isWebhookSubscriptionAuthorized(42, "42")).toBe(true);
    expect(isWebhookSubscriptionAuthorized(42, "43")).toBe(false);
  });

  it("drops a connection only after Strava confirms the token is revoked", () => {
    expect(shouldDropConnectionFromWebhook("revoked")).toBe("drop");
    expect(shouldDropConnectionFromWebhook("authorized")).toBe("keep");
    expect(shouldDropConnectionFromWebhook("unavailable")).toBe("retry");
  });

  it("deletes a local activity only when Strava says it is gone", () => {
    expect(shouldDeleteLocalActivityFromWebhook("missing")).toBe("delete");
    expect(shouldDeleteLocalActivityFromWebhook("exists")).toBe("ignore");
    expect(shouldDeleteLocalActivityFromWebhook("revoked")).toBe("ignore");
    expect(shouldDeleteLocalActivityFromWebhook("unavailable")).toBe("retry");
  });

  it("reads the client IP from forwarded headers", () => {
    expect(requestClientIp(new Headers({ "x-forwarded-for": " 1.2.3.4, 10.0.0.1" }))).toBe(
      "1.2.3.4",
    );
    expect(requestClientIp(new Headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(requestClientIp(new Headers())).toBe("unknown");
  });
});
