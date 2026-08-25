import { describe, expect, it } from "vitest";
import { RATE_LIMIT_ACTIONS, RateLimitError, isRateLimitError } from "./rate-limit";

describe("RATE_LIMIT_ACTIONS", () => {
  it("keeps search and photo analyze on a one-minute window", () => {
    expect(RATE_LIMIT_ACTIONS.off_search).toEqual({ maxCount: 30, windowSeconds: 60 });
    expect(RATE_LIMIT_ACTIONS.off_barcode).toEqual({ maxCount: 30, windowSeconds: 60 });
    expect(RATE_LIMIT_ACTIONS.food_photo_analyze).toEqual({ maxCount: 10, windowSeconds: 60 });
    expect(RATE_LIMIT_ACTIONS.save_gemini_key.windowSeconds).toBe(15 * 60);
    expect(RATE_LIMIT_ACTIONS.strava_connect.windowSeconds).toBe(15 * 60);
    expect(RATE_LIMIT_ACTIONS.strava_sync.maxCount).toBe(12);
    expect(RATE_LIMIT_ACTIONS.shortcut_ingest.maxCount).toBe(30);
  });
});

describe("RateLimitError", () => {
  it("is detectable via isRateLimitError", () => {
    expect(isRateLimitError(new RateLimitError())).toBe(true);
    expect(isRateLimitError(new Error("nope"))).toBe(false);
  });
});
