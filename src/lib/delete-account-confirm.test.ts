import { describe, expect, it } from "vitest";
import {
  DELETE_CONFIRM_WORD,
  getDeleteConfirmation,
  isDeleteConfirmed,
} from "./delete-account-confirm";

describe("delete account confirmation", () => {
  it("asks for the email when the account has one", () => {
    expect(getDeleteConfirmation("Ana@Example.com")).toMatchObject({
      expected: "Ana@Example.com",
      inputType: "email",
    });
    expect(isDeleteConfirmed(" ana@example.com ", "Ana@Example.com")).toBe(true);
    expect(isDeleteConfirmed("other@example.com", "Ana@Example.com")).toBe(false);
    expect(isDeleteConfirmed("", "Ana@Example.com")).toBe(false);
  });

  it("asks for a confirmation word when there is no email (demo users)", () => {
    for (const email of [null, "", "  "]) {
      expect(getDeleteConfirmation(email)).toMatchObject({
        expected: DELETE_CONFIRM_WORD,
        inputType: "text",
      });
      expect(isDeleteConfirmed("löschen", email)).toBe(true);
      expect(isDeleteConfirmed(DELETE_CONFIRM_WORD, email)).toBe(true);
      expect(isDeleteConfirmed("", email)).toBe(false);
      expect(isDeleteConfirmed("ja", email)).toBe(false);
    }
  });
});
