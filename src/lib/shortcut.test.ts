import { describe, expect, it } from "vitest";
import {
  ShortcutError,
  buildShortcutWebhookUrl,
  extractShortcutToken,
  parseCaloriesInput,
  parseShortcutDate,
  parseShortcutExercisePayload,
} from "./shortcut";
import { generateShortcutToken, hashShortcutToken } from "./shortcut.server";

describe("parseShortcutExercisePayload", () => {
  it("reads English and German keys", () => {
    expect(
      parseShortcutExercisePayload(
        { name: "  Tempo  ", calories: 380.4, date: "2026-08-25" },
        "2026-01-01",
      ),
    ).toEqual({
      name: "Tempo",
      calories: 380,
      date: "2026-08-25",
      externalId: null,
    });
    expect(
      parseShortcutExercisePayload(
        { titel: "Radfahren", kalorien: "412 kcal", datum: "2026-08-20T18:00:00" },
        "2026-01-01",
      ),
    ).toEqual({
      name: "Radfahren",
      calories: 412,
      date: "2026-08-20",
      externalId: null,
    });
  });

  it("defaults the name and date", () => {
    expect(parseShortcutExercisePayload({ calories: 10 }, "2026-08-25")).toMatchObject({
      name: "Training",
      date: "2026-08-25",
      calories: 10,
    });
  });

  it("keeps an optional workout id for dedup", () => {
    expect(
      parseShortcutExercisePayload({ calories: 1, id: "abc-123" }, "2026-08-25").externalId,
    ).toBe("abc-123");
  });

  it("rejects missing calories and bad dates", () => {
    expect(() => parseShortcutExercisePayload({ name: "Run" }, "2026-08-25")).toThrow(
      ShortcutError,
    );
    expect(() =>
      parseShortcutExercisePayload({ calories: 1, date: "25.08.2026" }, "2026-08-25"),
    ).toThrow(/YYYY-MM-DD/);
  });
});

describe("parseCaloriesInput / parseShortcutDate", () => {
  it("parses numbers hidden in Health strings", () => {
    expect(parseCaloriesInput(380)).toBe(380);
    expect(parseCaloriesInput("380,2 kcal")).toBe(380);
    expect(parseCaloriesInput("nope")).toBeNull();
  });

  it("uses the fallback date when empty", () => {
    expect(parseShortcutDate("", "2026-08-25")).toBe("2026-08-25");
    expect(parseShortcutDate("2026-08-01T12:00:00Z", "x")).toBe("2026-08-01");
  });
});

describe("webhook URL and token", () => {
  it("builds a query-token URL", () => {
    expect(buildShortcutWebhookUrl("https://cool-joule.vercel.app/", "cj_abc")).toBe(
      "https://cool-joule.vercel.app/api/shortcuts/exercise?token=cj_abc",
    );
  });

  it("reads token from query, bearer, or header", () => {
    expect(
      extractShortcutToken(new Request("https://x.example/api/shortcuts/exercise?token=q1")),
    ).toBe("q1");
    expect(
      extractShortcutToken(
        new Request("https://x.example/api", { headers: { Authorization: "Bearer tok" } }),
      ),
    ).toBe("tok");
    expect(
      extractShortcutToken(
        new Request("https://x.example/api", { headers: { "X-Shortcut-Token": "h1" } }),
      ),
    ).toBe("h1");
  });

  it("hashes tokens stably", () => {
    const token = generateShortcutToken();
    expect(token.startsWith("cj_")).toBe(true);
    expect(hashShortcutToken(token)).toBe(hashShortcutToken(token));
    expect(hashShortcutToken(token)).toHaveLength(64);
    expect(hashShortcutToken(token)).not.toBe(hashShortcutToken(`${token}x`));
  });
});
