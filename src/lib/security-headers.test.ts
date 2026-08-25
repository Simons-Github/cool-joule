import { describe, expect, it } from "vitest";
import { getSupabaseConnectSrc, securityHeaderMap } from "./security-headers";

describe("getSupabaseConnectSrc", () => {
  it("falls back to self without a URL", () => {
    expect(getSupabaseConnectSrc("")).toBe("'self'");
    expect(getSupabaseConnectSrc("not a url")).toBe("'self'");
  });

  it("includes https and wss origins", () => {
    expect(getSupabaseConnectSrc("https://abc.supabase.co")).toBe(
      "'self' https://abc.supabase.co wss://abc.supabase.co",
    );
  });
});

describe("securityHeaderMap", () => {
  it("sets clickjacking and MIME sniffing guards", () => {
    const headers = securityHeaderMap("https://abc.supabase.co");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["Content-Security-Policy"]).toContain("https://abc.supabase.co");
    expect(headers["Content-Security-Policy"]).not.toContain("https://evil.example");
  });
});
