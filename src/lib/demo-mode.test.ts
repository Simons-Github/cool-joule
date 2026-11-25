import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEMO_FEATURE_DISABLED_MESSAGE,
  DemoModeError,
  assertNotDemoUser,
  getDemoStartErrorMessage,
  isDemoUser,
} from "./demo-mode";

const { getRequestHeader, getUser } = vi.hoisted(() => ({
  getRequestHeader: vi.fn<(name: string) => string | undefined>(),
  getUser: vi.fn(),
}));

vi.mock("@tanstack/react-start/server", () => ({ getRequestHeader }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser } } }));

describe("isDemoUser", () => {
  it("is true only for anonymous Supabase users", () => {
    expect(isDemoUser({ is_anonymous: true })).toBe(true);
    expect(isDemoUser({ is_anonymous: false })).toBe(false);
    expect(isDemoUser({})).toBe(false);
    expect(isDemoUser(null)).toBe(false);
    expect(isDemoUser(undefined)).toBe(false);
  });
});

describe("assertNotDemoUser", () => {
  it("throws a DemoModeError for anonymous users", () => {
    expect(() => assertNotDemoUser({ isAnonymous: true })).toThrow(DemoModeError);
    expect(() => assertNotDemoUser({ isAnonymous: true })).toThrow(DEMO_FEATURE_DISABLED_MESSAGE);
    expect(() => assertNotDemoUser({ isAnonymous: false })).not.toThrow();
  });
});

describe("getDemoStartErrorMessage", () => {
  it("explains a disabled anonymous provider", () => {
    expect(getDemoStartErrorMessage({ code: "anonymous_provider_disabled" })).toMatch(
      /Demo-Modus ist gerade nicht verfügbar/,
    );
  });

  it("explains rate limiting", () => {
    expect(getDemoStartErrorMessage({ code: "over_request_rate_limit" })).toMatch(/Minuten/);
  });

  it("falls back to a generic message without leaking internals", () => {
    expect(getDemoStartErrorMessage({ code: "unexpected_failure" })).toBe(
      "Die Demo konnte nicht gestartet werden. Bitte später erneut versuchen.",
    );
    expect(getDemoStartErrorMessage(null)).toMatch(/nicht gestartet/);
  });
});

describe("requireAuthenticatedUser demo handling", () => {
  const UNAUTH = "Bitte anmelden.";

  beforeEach(() => {
    getRequestHeader.mockReset().mockReturnValue("Bearer token");
    getUser.mockReset();
  });

  function signedInAs(isAnonymous: boolean) {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: isAnonymous ? undefined : "a@example.com",
          is_anonymous: isAnonymous,
        },
      },
      error: null,
    });
  }

  it("lets demo users through by default and flags them", async () => {
    signedInAs(true);
    const { requireAuthenticatedUser } = await import("./server-auth");
    await expect(requireAuthenticatedUser(UNAUTH)).resolves.toEqual({
      id: "user-1",
      email: null,
      isAnonymous: true,
    });
  });

  it("rejects demo users when allowDemo is false", async () => {
    signedInAs(true);
    const { requireAuthenticatedUser, requireAuthenticatedUserId } = await import("./server-auth");
    await expect(requireAuthenticatedUser(UNAUTH, { allowDemo: false })).rejects.toBeInstanceOf(
      DemoModeError,
    );
    await expect(requireAuthenticatedUserId(UNAUTH, { allowDemo: false })).rejects.toBeInstanceOf(
      DemoModeError,
    );
  });

  it("keeps full accounts working when allowDemo is false", async () => {
    signedInAs(false);
    const { requireAuthenticatedUserId } = await import("./server-auth");
    await expect(requireAuthenticatedUserId(UNAUTH, { allowDemo: false })).resolves.toBe("user-1");
  });

  it("still rejects missing tokens with the unauthenticated message", async () => {
    getRequestHeader.mockReturnValue(undefined);
    const { requireAuthenticatedUser } = await import("./server-auth");
    await expect(requireAuthenticatedUser(UNAUTH, { allowDemo: false })).rejects.toThrow(UNAUTH);
    expect(getUser).not.toHaveBeenCalled();
  });
});
