import { describe, expect, it } from "vitest";
import {
  SERVER_KEY_PHOTO_LIMIT,
  SERVER_KEY_PHOTO_WINDOW_MS,
  formatQuotaReset,
  getServerKeyQuotaExceededMessage,
  isFoodPhotoQuotaBlocked,
  isServerKeyQuotaAvailable,
  serverKeyQuotaResetsAt,
  toLimitedFoodPhotoQuota,
} from "./food-photo-quota";

const NOW = new Date("2026-08-25T10:34:00.000Z");

describe("isServerKeyQuotaAvailable", () => {
  it("allows a first analysis", () => {
    expect(isServerKeyQuotaAvailable(null, NOW)).toBe(true);
  });

  it("blocks within the 24h window", () => {
    expect(isServerKeyQuotaAvailable(NOW, NOW)).toBe(false);
    expect(
      isServerKeyQuotaAvailable(new Date(NOW.getTime() - SERVER_KEY_PHOTO_WINDOW_MS + 1), NOW),
    ).toBe(false);
  });

  it("allows exactly 24h later", () => {
    expect(
      isServerKeyQuotaAvailable(new Date(NOW.getTime() - SERVER_KEY_PHOTO_WINDOW_MS), NOW),
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

  it("returns the reset time while exhausted", () => {
    expect(toLimitedFoodPhotoQuota(NOW, NOW)).toEqual({
      limited: true,
      remaining: 0,
      resetsAt: serverKeyQuotaResetsAt(NOW).toISOString(),
    });
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
    expect(message).toMatch(/1 Fotoanalyse pro 24 Stunden/);
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
