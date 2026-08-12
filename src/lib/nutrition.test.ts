import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, formatGermanDate, fromISO, toISO, todayISO } from "./nutrition";

describe("toISO / fromISO", () => {
  it("round-trips a local calendar date without shifting days", () => {
    const d = new Date(2026, 0, 15); // Jan 15, 2026, local midnight
    expect(toISO(d)).toBe("2026-01-15");
    expect(fromISO("2026-01-15").getTime()).toBe(d.getTime());
  });

  it("never crosses a day boundary via UTC conversion (unlike toISOString)", () => {
    // A time late in the local day, close to the next UTC day.
    const d = new Date(2026, 5, 30, 23, 30);
    expect(toISO(d)).toBe("2026-06-30");
  });

  it("pads single-digit months and days", () => {
    expect(toISO(new Date(2026, 2, 5))).toBe("2026-03-05");
  });
});

describe("todayISO", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reflects the local date regardless of the machine's UTC offset", () => {
    // Local time is just after midnight; UTC is still the previous day for
    // any timezone with a positive offset. todayISO() must use the local day.
    vi.setSystemTime(new Date(2026, 4, 10, 0, 30));
    expect(todayISO()).toBe("2026-05-10");
  });
});

describe("addDays", () => {
  it("moves forward and backward across month boundaries", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("formatGermanDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 10, 12, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("labels today, yesterday and tomorrow relative to the local date", () => {
    expect(formatGermanDate("2026-05-10")).toBe("Heute");
    expect(formatGermanDate("2026-05-09")).toBe("Gestern");
    expect(formatGermanDate("2026-05-11")).toBe("Morgen");
  });
});
