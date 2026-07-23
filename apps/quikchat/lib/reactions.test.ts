import { describe, expect, it } from "vitest";
import { emojiName, QUICK_REACTIONS, reactorSummary } from "./reactions";

describe("emojiName", () => {
  it("labels known emojis and falls back to 'Reaction'", () => {
    expect(emojiName("👍")).toBe("Thumbs up");
    expect(emojiName("🎉")).toBe("Party");
    expect(emojiName("🦄")).toBe("Reaction");
  });
  it("every quick-reaction has a non-fallback label", () => {
    for (const e of QUICK_REACTIONS) expect(emojiName(e)).not.toBe("Reaction");
  });
});

describe("reactorSummary", () => {
  const names = new Map([
    ["u-bob", "Bob"],
    ["u-cara", "Cara"],
    ["u-dan", "Dan"],
  ]);
  it("single reactor", () => {
    expect(reactorSummary(["u-bob"], names, "me")).toBe("Bob");
  });
  it("two reactors", () => {
    expect(reactorSummary(["u-bob", "u-cara"], names, "me")).toBe("Bob and Cara");
  });
  it("three+ collapses to 'and N others'", () => {
    expect(reactorSummary(["u-bob", "u-cara", "u-dan"], names, "me")).toBe("Bob, Cara and 1 other");
    expect(reactorSummary(["u-bob", "u-cara", "u-dan", "x", "y"], names, "me")).toBe(
      "Bob, Cara and 3 others",
    );
  });
  it("puts the current user first as 'You'", () => {
    expect(reactorSummary(["u-bob", "me"], names, "me")).toBe("You and Bob");
  });
});
