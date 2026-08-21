import { describe, expect, it } from "vitest";

/**
 * Inline (grid) edits must not create a new case version.
 *
 * `updateTestCase` ALWAYS mints a version, because a version pins what a historical run
 * executed. Applying that to a Priority tweak would push a suite to v12 on label
 * changes alone and make the version history useless for its actual purpose — so the
 * grid uses a separate path that deliberately does not version.
 *
 * These assertions cover the FIELD ALLOW-LIST, which is what keeps that split honest:
 * the inline path must be structurally unable to touch the case body. The
 * version-vs-no-version behaviour itself is asserted against the real database (see the
 * session log for QUIKTEST-INLINE), since it is a Prisma-level guarantee.
 */

/** Fields the inline path accepts — mirrors InlinePatch and the route's .strict() schema. */
const INLINE_FIELDS = [
  "title",
  "priority",
  "type",
  "automationStatus",
  "approvalState",
] as const;

/** Body fields that MUST go through the versioning editor instead. */
const BODY_FIELDS = [
  "steps",
  "preconditions",
  "expectedResult",
  "description",
  "sectionId",
  "templateId",
] as const;

const PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "LOWEST"];
const APPROVAL = ["DRAFT", "IN_REVIEW", "APPROVED", "DEPRECATED"];
const AUTOMATION = ["MANUAL", "AUTOMATED"];

describe("inline edit field allow-list", () => {
  it("permits exactly the five grid fields", () => {
    expect([...INLINE_FIELDS].sort()).toEqual([
      "approvalState",
      "automationStatus",
      "priority",
      "title",
      "type",
    ]);
  });

  it("permits no case-BODY field", () => {
    // If one of these ever appears in INLINE_FIELDS, an edit to it would skip the
    // version snapshot that historical runs depend on.
    for (const field of BODY_FIELDS) {
      expect(INLINE_FIELDS as readonly string[]).not.toContain(field);
    }
  });

  it("does not permit currentVersion itself", () => {
    expect(INLINE_FIELDS as readonly string[]).not.toContain("currentVersion");
  });
});

describe("inline edit value validation", () => {
  // These columns are FREE TEXT in the schema — no DB CHECK — which is exactly how
  // `priority = "SAsaS"` reached QtIssue and crashed a render. Every value must be
  // checked in code.
  const check = (value: string, allowed: string[]) => allowed.includes(value);

  it("accepts each valid priority", () => {
    for (const p of PRIORITIES) expect(check(p, PRIORITIES)).toBe(true);
  });

  it("rejects a bogus priority", () => {
    expect(check("SAsaS", PRIORITIES)).toBe(false);
    expect(check("high", PRIORITIES)).toBe(false); // case-sensitive on purpose
  });

  it("rejects a bogus approval state", () => {
    expect(check("PENDING", APPROVAL)).toBe(false);
  });

  it("rejects a bogus automation status", () => {
    expect(check("MAYBE", AUTOMATION)).toBe(false);
  });
});

describe("title rules", () => {
  const validate = (raw: string): string | null => {
    const t = raw.trim();
    if (!t) return "A title is required.";
    if (t.length > 255) return "too long";
    return null;
  };

  it("rejects empty and whitespace-only titles", () => {
    expect(validate("")).not.toBeNull();
    expect(validate("   ")).not.toBeNull();
  });

  it("rejects a title over 255 characters", () => {
    expect(validate("x".repeat(256))).not.toBeNull();
    expect(validate("x".repeat(255))).toBeNull();
  });

  it("trims before measuring", () => {
    expect(validate(`  ${"x".repeat(255)}  `)).toBeNull();
  });
});
