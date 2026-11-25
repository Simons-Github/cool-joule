import { describe, expect, it } from "vitest";
import { getDeleteConfirmation, isDeleteConfirmed } from "../delete-account-confirm";
import { getDemoStartErrorMessage } from "../demo-mode";
import { formatDiaryDate, mealLabel, todayISO } from "../nutrition";
import { validatePassword } from "../password";
import { createT } from "./index";

describe("localized lib messages", () => {
  it("validatePassword defaults to German and can return English", () => {
    expect(validatePassword("Aa1!")).toMatch(/mindestens 10/);
    expect(validatePassword("Aa1!", "en")).toMatch(/at least 10/);
  });

  it("delete confirmation accepts both words whichever language is shown", () => {
    expect(getDeleteConfirmation(null, "en")).toMatchObject({ expected: "DELETE" });
    expect(isDeleteConfirmed("delete", null)).toBe(true);
    expect(isDeleteConfirmed("löschen", null)).toBe(true);
    expect(isDeleteConfirmed("nope", null)).toBe(false);
  });

  it("demo start error is localized", () => {
    expect(getDemoStartErrorMessage(null, "en")).toMatch(/couldn't be started/);
  });

  it("meal ids stay stable while labels are translated", () => {
    expect(mealLabel(createT("de"), "breakfast")).toBe("Frühstück");
    expect(mealLabel(createT("en"), "breakfast")).toBe("Breakfast");
    expect(mealLabel(createT("en"), "unknown-id")).toBe("unknown-id");
  });

  it("formats relative diary dates per language", () => {
    expect(formatDiaryDate(todayISO(), "de")).toBe("Heute");
    expect(formatDiaryDate(todayISO(), "en")).toBe("Today");
  });
});
