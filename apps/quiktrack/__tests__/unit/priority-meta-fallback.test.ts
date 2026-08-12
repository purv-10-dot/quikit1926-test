import { describe, expect, it } from "vitest";
import { PRIORITY_META } from "@/app/(dashboard)/spaces/[id]/board/_components/board-meta";

/**
 * Regression: an issue with an unmapped `priority` crashed the edit modal with
 * "Cannot read properties of undefined (reading 'Icon')".
 *
 * QUIKTR-114 held priority "SAsaS" — `QtIssue.priority` is a plain text column
 * with NO check constraint, so although every API route validates against the
 * five-value enum, anything reaching the DB by another route (a direct write, an
 * older build, a seed script) is rendered verbatim by the UI.
 *
 * Every `PRIORITY_META[value]` read must therefore tolerate a miss. These tests
 * pin the vocabulary and the fallback contract; the components use
 * `?? PRIORITY_META.MEDIUM` (or `?? null` where the render is conditional).
 */

describe("PRIORITY_META", () => {
  it("covers exactly the five supported priorities", () => {
    expect(Object.keys(PRIORITY_META).sort()).toEqual([
      "HIGH",
      "HIGHEST",
      "LOW",
      "LOWEST",
      "MEDIUM",
    ]);
  });

  it("gives every entry the fields the UI reads", () => {
    for (const [key, meta] of Object.entries(PRIORITY_META)) {
      expect(meta.label, `${key}.label`).toBeTruthy();
      expect(meta.color, `${key}.color`).toBeTruthy();
      expect(meta.Icon, `${key}.Icon`).toBeTruthy();
    }
  });

  it("has a MEDIUM entry, since that is the fallback every caller uses", () => {
    expect(PRIORITY_META.MEDIUM).toBeDefined();
    expect(PRIORITY_META.MEDIUM.Icon).toBeTruthy();
  });

  it("returns undefined for an unmapped value — the case that crashed", () => {
    // Confirms the hazard is real: without `??`, `.Icon` throws here.
    const meta = (PRIORITY_META as Record<string, unknown>)["SAsaS"];
    expect(meta).toBeUndefined();
  });

  it("the documented fallback yields a renderable entry", () => {
    const value = "SAsaS" as keyof typeof PRIORITY_META;
    const safe = PRIORITY_META[value] ?? PRIORITY_META.MEDIUM;
    expect(safe.Icon).toBeTruthy();
    expect(safe.label).toBe("Medium");
  });
});
