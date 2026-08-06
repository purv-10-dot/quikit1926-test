import { describe, expect, it } from "vitest";
import { parseIssueKeys } from "@/lib/services/github/issue-key";

describe("parseIssueKeys", () => {
  it("extracts a single key", () => {
    expect(parseIssueKeys("QT-123 fix login")).toEqual(["QT-123"]);
  });

  it("extracts multiple distinct keys in first-seen order", () => {
    expect(parseIssueKeys("QT-1 relates to CA-42 and QT-1 again")).toEqual([
      "QT-1",
      "CA-42",
    ]);
  });

  it("is case-insensitive (branch names are often lowercase)", () => {
    expect(parseIssueKeys("feature/qt-7-signup-wizard")).toEqual(["QT-7"]);
  });

  it("returns empty for text with no key", () => {
    expect(parseIssueKeys("just a normal commit message")).toEqual([]);
    expect(parseIssueKeys("")).toEqual([]);
    expect(parseIssueKeys(null)).toEqual([]);
    expect(parseIssueKeys(undefined)).toEqual([]);
  });

  it("requires the digit suffix (ignores bare prefixes)", () => {
    expect(parseIssueKeys("QT- and QT and -5")).toEqual([]);
  });

  it("matches project prefixes with digits (e.g. ABC2-9)", () => {
    expect(parseIssueKeys("ABC2-9 done")).toEqual(["ABC2-9"]);
  });

  it("does not match when a digit immediately precedes the letters", () => {
    // "9QT-1" has no word boundary before the letters, so the [A-Z]-anchored
    // pattern can't start there.
    expect(parseIssueKeys("9QT-1")).toEqual([]);
  });
});
