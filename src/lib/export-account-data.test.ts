import { describe, expect, it } from "vitest";
import { accountExportFilename } from "./export-account-data";

describe("accountExportFilename", () => {
  it("uses the local calendar date", () => {
    expect(accountExportFilename("2026-08-25")).toBe("cool-joule-export-2026-08-25.json");
  });
});
