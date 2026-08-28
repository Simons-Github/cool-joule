import { describe, expect, it } from "vitest";
import {
  RATE_LIMIT_ACTIONS,
  RateLimitError,
  STRAVA_WEBHOOK_IP_LIMIT,
  claimFixedWindow,
  isRateLimitError,
} from "./rate-limit";

describe("RATE_LIMIT_ACTIONS", () => {
  it("keeps search and photo analyze on a one-minute window", () => {
    expect(RATE_LIMIT_ACTIONS.off_search).toEqual({ maxCount: 30, windowSeconds: 60 });
    expect(RATE_LIMIT_ACTIONS.off_barcode).toEqual({ maxCount: 30, windowSeconds: 60 });
    expect(RATE_LIMIT_ACTIONS.food_photo_analyze).toEqual({ maxCount: 10, windowSeconds: 60 });
    expect(RATE_LIMIT_ACTIONS.save_gemini_key.windowSeconds).toBe(15 * 60);
    expect(RATE_LIMIT_ACTIONS.strava_connect.windowSeconds).toBe(15 * 60);
    expect(RATE_LIMIT_ACTIONS.strava_sync.maxCount).toBe(12);
    expect(RATE_LIMIT_ACTIONS.strava_webhook).toEqual({ maxCount: 30, windowSeconds: 60 });
    expect(RATE_LIMIT_ACTIONS.shortcut_ingest.maxCount).toBe(30);
  });
});

describe("RateLimitError", () => {
  it("is detectable via isRateLimitError", () => {
    expect(isRateLimitError(new RateLimitError())).toBe(true);
    expect(isRateLimitError(new Error("nope"))).toBe(false);
  });
});

describe("claimFixedWindow", () => {
  it("allows up to maxCount requests inside the window, then denies", () => {
    const store = new Map<string, { startedAt: number; count: number }>();
    const now = 1_700_000_000_000;
    expect(claimFixedWindow(store, "ip:1", 2, 60, now)).toBe(true);
    expect(claimFixedWindow(store, "ip:1", 2, 60, now + 1000)).toBe(true);
    expect(claimFixedWindow(store, "ip:1", 2, 60, now + 2000)).toBe(false);
    expect(claimFixedWindow(store, "ip:2", 2, 60, now + 2000)).toBe(true);
  });

  it("resets after the window elapses", () => {
    const store = new Map<string, { startedAt: number; count: number }>();
    const now = 1_700_000_000_000;
    expect(claimFixedWindow(store, "ip:1", 1, 60, now)).toBe(true);
    expect(claimFixedWindow(store, "ip:1", 1, 60, now + 59_000)).toBe(false);
    expect(claimFixedWindow(store, "ip:1", 1, 60, now + 60_000)).toBe(true);
  });

  it("keeps the Strava webhook IP budget at 60 per minute", () => {
    expect(STRAVA_WEBHOOK_IP_LIMIT).toEqual({ maxCount: 60, windowSeconds: 60 });
  });
});
