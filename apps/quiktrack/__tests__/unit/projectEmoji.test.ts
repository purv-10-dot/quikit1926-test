import { describe, it, expect } from "vitest";
import { PROJECT_EMOJIS, randomProjectEmoji } from "@/lib/utils/projectEmoji";

describe("randomProjectEmoji()", () => {
  it("returns a value from the curated palette", () => {
    for (let i = 0; i < 20; i++) {
      expect(PROJECT_EMOJIS).toContain(randomProjectEmoji());
    }
  });

  it("palette is non-empty and unique", () => {
    expect(PROJECT_EMOJIS.length).toBeGreaterThan(10);
    expect(new Set(PROJECT_EMOJIS).size).toBe(PROJECT_EMOJIS.length);
  });
});
