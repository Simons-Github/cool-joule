import { describe, expect, it } from "vitest";
import { PASSWORD_MIN_LENGTH, mapAuthErrorMessage, validatePassword } from "./password";

describe("validatePassword", () => {
  it("rejects passwords shorter than the minimum length", () => {
    expect(validatePassword("Aa1!")).toMatch(/mindestens 10/i);
  });

  it("rejects passwords that only meet the old length rule", () => {
    expect(validatePassword("password1")).toBeTruthy();
  });

  it("rejects missing lowercase, uppercase, digit, or symbol", () => {
    expect(validatePassword("PASSWORD12!")).toMatch(/Kleinbuchstaben/);
    expect(validatePassword("password12!")).toMatch(/Großbuchstaben/);
    expect(validatePassword("Password!!")).toMatch(/Zahl/);
    expect(validatePassword("Password12")).toMatch(/Sonderzeichen/);
  });

  it("accepts a password that meets all rules", () => {
    expect(validatePassword("Password1!")).toBeNull();
    expect("Password1!".length).toBeGreaterThanOrEqual(PASSWORD_MIN_LENGTH);
  });
});

describe("mapAuthErrorMessage", () => {
  it("maps weak_password to German requirements copy", () => {
    const message = mapAuthErrorMessage({
      message: "Password should contain at least one character of each...",
      code: "weak_password",
    });
    expect(message).toMatch(/zu schwach/i);
    expect(message).toMatch(/10 Zeichen/);
  });

  it("passes through other errors unchanged", () => {
    expect(mapAuthErrorMessage({ message: "Invalid login credentials" })).toBe(
      "Invalid login credentials",
    );
  });
});
