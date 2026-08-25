import { describe, expect, it } from "vitest";
import {
  hasFoodPhotoGatewayAuth,
  isFoodPhotoAppKeyAllowed,
  parseAllowlist,
} from "./food-photo-allowlist";

const USER = { id: "11111111-1111-1111-1111-111111111111", email: "owner@example.com" };

describe("parseAllowlist", () => {
  it("returns an empty list for blank input", () => {
    expect(parseAllowlist(undefined)).toEqual([]);
    expect(parseAllowlist("")).toEqual([]);
    expect(parseAllowlist("  ,  , ")).toEqual([]);
  });

  it("trims comma-separated entries", () => {
    expect(parseAllowlist(" a, b ,c")).toEqual(["a", "b", "c"]);
  });
});

describe("isFoodPhotoAppKeyAllowed", () => {
  it("is fail-closed when both lists are empty", () => {
    expect(isFoodPhotoAppKeyAllowed(USER, { userIds: "", emails: "" })).toBe(false);
    expect(isFoodPhotoAppKeyAllowed(USER, {})).toBe(false);
  });

  it("matches user ids exactly", () => {
    expect(isFoodPhotoAppKeyAllowed(USER, { userIds: USER.id })).toBe(true);
    expect(isFoodPhotoAppKeyAllowed(USER, { userIds: "other-id" })).toBe(false);
  });

  it("matches emails case-insensitively", () => {
    expect(isFoodPhotoAppKeyAllowed(USER, { emails: "Owner@Example.com" })).toBe(true);
    expect(
      isFoodPhotoAppKeyAllowed(
        { ...USER, email: "  Owner@Example.com  " },
        { emails: USER.email! },
      ),
    ).toBe(true);
    expect(isFoodPhotoAppKeyAllowed(USER, { emails: "other@example.com" })).toBe(false);
  });

  it("does not match a missing email against an email allowlist", () => {
    expect(isFoodPhotoAppKeyAllowed({ id: USER.id, email: null }, { emails: USER.email! })).toBe(
      false,
    );
  });
});

describe("hasFoodPhotoGatewayAuth", () => {
  it("does not treat VERCEL as gateway auth", () => {
    expect(hasFoodPhotoGatewayAuth({ VERCEL: "1" })).toBe(false);
  });

  it("accepts an API key or an explicit flag", () => {
    expect(hasFoodPhotoGatewayAuth({ AI_GATEWAY_API_KEY: "gw-key" })).toBe(true);
    expect(hasFoodPhotoGatewayAuth({ FOOD_PHOTO_USE_AI_GATEWAY: "true" })).toBe(true);
    expect(hasFoodPhotoGatewayAuth({ FOOD_PHOTO_USE_AI_GATEWAY: "1" })).toBe(true);
    expect(hasFoodPhotoGatewayAuth({ FOOD_PHOTO_USE_AI_GATEWAY: "yes" })).toBe(true);
    expect(hasFoodPhotoGatewayAuth({ FOOD_PHOTO_USE_AI_GATEWAY: "false" })).toBe(false);
  });
});
