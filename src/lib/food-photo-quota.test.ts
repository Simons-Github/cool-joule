import { describe, expect, it } from "vitest";
import {
  SERVER_KEY_PHOTO_LIMIT,
  SERVER_KEY_PHOTO_WINDOW_MS,
  formatQuotaReset,
  getServerKeyQuotaExceededMessage,
  isFoodPhotoQuotaBlocked,
  isServerKeyQuotaAvailable,
  ownKeyRequiredQuota,
  remainingServerKeyQuota,
  serverKeyQuotaResetsAt,
  toLimitedFoodPhotoQuota,
} from "./food-photo-quota";

const NOW = new Date("2026-08-25T10:34:00.000Z");
const used = (useCount: number, windowStartedAt = NOW) => ({ windowStartedAt, useCount });

describe("remainingServerKeyQuota", () => {
  it("allows a first analysis", () => {
    expect(remainingServerKeyQuota(null, NOW)).toBe(SERVER_KEY_PHOTO_LIMIT);
    expect(isServerKeyQuotaAvailable(null, NOW)).toBe(true);
  });

  it("counts remaining uses inside the 24h window", () => {
    expect(remainingServerKeyQuota(used(1), NOW)).toBe(4);
    expect(remainingServerKeyQuota(used(4), NOW)).toBe(1);
    expect(isServerKeyQuotaAvailable(used(4), NOW)).toBe(true);
  });

  it("blocks after 5 uses within the window", () => {
    expect(remainingServerKeyQuota(used(SERVER_KEY_PHOTO_LIMIT), NOW)).toBe(0);
    expect(isServerKeyQuotaAvailable(used(SERVER_KEY_PHOTO_LIMIT), NOW)).toBe(false);
    expect(
      isServerKeyQuotaAvailable(
        used(SERVER_KEY_PHOTO_LIMIT, new Date(NOW.getTime() - SERVER_KEY_PHOTO_WINDOW_MS + 1)),
        NOW,
      ),
    ).toBe(false);
  });

  it("resets exactly 24h after the window started", () => {
    expect(
      remainingServerKeyQuota(
        used(SERVER_KEY_PHOTO_LIMIT, new Date(NOW.getTime() - SERVER_KEY_PHOTO_WINDOW_MS)),
        NOW,
      ),
    ).toBe(SERVER_KEY_PHOTO_LIMIT);
    expect(
      isServerKeyQuotaAvailable(
        used(SERVER_KEY_PHOTO_LIMIT, new Date(NOW.getTime() - SERVER_KEY_PHOTO_WINDOW_MS)),
        NOW,
      ),
    ).toBe(true);
  });
});

describe("toLimitedFoodPhotoQuota", () => {
  it("returns remaining capacity when unused", () => {
    expect(toLimitedFoodPhotoQuota(null, NOW)).toEqual({
      limited: true,
      remaining: SERVER_KEY_PHOTO_LIMIT,
      resetsAt: null,
    });
  });

  it("returns remaining uses while the window has capacity", () => {
    expect(toLimitedFoodPhotoQuota(used(2), NOW)).toEqual({
      limited: true,
      remaining: 3,
      resetsAt: null,
    });
  });

  it("returns the reset time while exhausted", () => {
    expect(toLimitedFoodPhotoQuota(used(SERVER_KEY_PHOTO_LIMIT), NOW)).toEqual({
      limited: true,
      remaining: 0,
      resetsAt: serverKeyQuotaResetsAt(NOW).toISOString(),
    });
  });
});

describe("ownKeyRequiredQuota", () => {
  it("blocks analysis and asks for a personal key", () => {
    expect(ownKeyRequiredQuota()).toEqual({
      limited: true,
      remaining: 0,
      resetsAt: null,
      requiresOwnKey: true,
    });
    expect(isFoodPhotoQuotaBlocked(ownKeyRequiredQuota())).toBe(true);
  });
});

describe("formatQuotaReset", () => {
  it("formats in Europe/Berlin", () => {
    expect(formatQuotaReset("2026-08-26T10:34:00.000Z")).toMatch(/12:34/);
  });
});

describe("getServerKeyQuotaExceededMessage", () => {
  it("mentions the 24h limit and profile key", () => {
    const message = getServerKeyQuotaExceededMessage(serverKeyQuotaResetsAt(NOW));
    expect(message).toMatch(/5 Fotoanalysen pro 24 Stunden/);
    expect(message).toMatch(/Profil/);
    expect(message).toMatch(/12:34/);
  });
});

describe("isFoodPhotoQuotaBlocked", () => {
  it("is only blocked for exhausted limited quotas", () => {
    expect(isFoodPhotoQuotaBlocked(undefined)).toBe(false);
    expect(isFoodPhotoQuotaBlocked({ limited: false })).toBe(false);
    expect(isFoodPhotoQuotaBlocked({ limited: true, remaining: 1, resetsAt: null })).toBe(false);
    expect(
      isFoodPhotoQuotaBlocked({
        limited: true,
        remaining: 0,
        resetsAt: serverKeyQuotaResetsAt(NOW).toISOString(),
      }),
    ).toBe(true);
  });
});
