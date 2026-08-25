import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, parseEncryptionKey } from "./secret-box";

const KEY = parseEncryptionKey("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");

describe("parseEncryptionKey", () => {
  it("accepts 32-byte Base64 keys and ignores whitespace", () => {
    expect(parseEncryptionKey("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=\n").length).toBe(32);
  });

  it("rejects keys that are not 32 bytes", () => {
    expect(() => parseEncryptionKey("AAAA")).toThrow(/32 bytes/);
  });
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips plaintext", () => {
    const ciphertext = encryptSecret("AIzaSyExampleSecretKeyValue12", KEY);
    expect(decryptSecret(ciphertext, KEY)).toBe("AIzaSyExampleSecretKeyValue12");
  });

  it("produces different ciphertexts for the same plaintext", () => {
    const a = encryptSecret("same-secret-value-12345", KEY);
    const b = encryptSecret("same-secret-value-12345", KEY);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, KEY)).toBe("same-secret-value-12345");
    expect(decryptSecret(b, KEY)).toBe("same-secret-value-12345");
  });

  it("fails with a different key", () => {
    const other = parseEncryptionKey("AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=");
    const ciphertext = encryptSecret("AIzaSyExampleSecretKeyValue12", KEY);
    expect(() => decryptSecret(ciphertext, other)).toThrow();
  });
});
