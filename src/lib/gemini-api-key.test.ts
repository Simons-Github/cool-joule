import { describe, expect, it } from "vitest";
import {
  geminiKeySuffix,
  normalizeGeminiApiKey,
  toGeminiKeyStatus,
  validateGeminiApiKey,
} from "./gemini-api-key";

describe("validateGeminiApiKey", () => {
  it("rejects empty and short keys", () => {
    expect(validateGeminiApiKey("")).toMatch(/eingeben/i);
    expect(validateGeminiApiKey("   ")).toMatch(/eingeben/i);
    expect(validateGeminiApiKey("short")).toMatch(/zu kurz/i);
  });

  it("rejects whitespace and illegal characters", () => {
    expect(validateGeminiApiKey("AIzaSyExample SecretKeyValue12")).toMatch(/Leerzeichen/);
    expect(validateGeminiApiKey("AIzaSyExampleSecretKeyValue12!")).toMatch(/ungültige Zeichen/);
  });

  it("accepts Google-style and dotted keys, including surrounding spaces", () => {
    expect(validateGeminiApiKey("AIzaSyExampleSecretKeyValue12")).toBeNull();
    expect(validateGeminiApiKey("  AQ.ExampleUserGeminiKeyValue12  ")).toBeNull();
  });
});

describe("normalizeGeminiApiKey", () => {
  it("trims a valid key", () => {
    expect(normalizeGeminiApiKey("  AIzaSyExampleSecretKeyValue12  ")).toBe(
      "AIzaSyExampleSecretKeyValue12",
    );
  });

  it("throws for empty input", () => {
    expect(() => normalizeGeminiApiKey("")).toThrow(/eingeben/i);
    expect(() => normalizeGeminiApiKey(null)).toThrow(/eingeben/i);
  });
});

describe("toGeminiKeyStatus", () => {
  it("never includes apiKey or ciphertext", () => {
    const empty = toGeminiKeyStatus(null);
    expect(empty).toEqual({ configured: false, suffix: null });
    expect(empty).not.toHaveProperty("apiKey");
    expect(empty).not.toHaveProperty("ciphertext");

    const configured = toGeminiKeyStatus({ key_suffix: "ab12" });
    expect(configured).toEqual({ configured: true, suffix: "ab12" });
    expect(configured).not.toHaveProperty("apiKey");
    expect(configured).not.toHaveProperty("ciphertext");
  });
});

describe("geminiKeySuffix", () => {
  it("returns the last four characters", () => {
    expect(geminiKeySuffix("AIzaSyExampleSecretKeyValue12")).toBe("ue12");
  });
});
