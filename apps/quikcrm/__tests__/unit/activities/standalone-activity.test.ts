/**
 * Standalone (unlinked) activity support — validator + sentinel helpers.
 *
 * CrmActivity.relatedKind/relatedObjectId are NOT NULL, so a standalone activity
 * is represented by the sentinel kind "None" + a sentinel object id. No schema
 * migration is needed: it shows in Global Activities but never on a record
 * timeline (those query by a specific relatedObjectId).
 */
import { describe, expect, it } from "vitest";
import { createActivitySchema } from "@/lib/validators/activity";
import {
  STANDALONE_KIND,
  STANDALONE_RELATED_ID,
  isStandaloneKind,
  isPrimaryKind,
  ACTIVITY_KINDS,
} from "@/lib/services/activities/target-existence";

describe("standalone activity sentinels", () => {
  it("exposes the four primary kinds plus the standalone 'None' kind", () => {
    expect(ACTIVITY_KINDS).toEqual(["None", "Lead", "Opportunity", "Contact", "Account"]);
    expect(isStandaloneKind(STANDALONE_KIND)).toBe(true);
    expect(isStandaloneKind("Lead")).toBe(false);
    // "None" is the standalone sentinel, NOT a primary (linkable) kind.
    expect(isPrimaryKind(STANDALONE_KIND)).toBe(false);
    expect(STANDALONE_RELATED_ID.length).toBeGreaterThan(0); // NOT-NULL column needs a value
  });
});

describe("createActivitySchema — standalone vs linked", () => {
  it("accepts a standalone activity with NO relatedObjectId", () => {
    const r = createActivitySchema.safeParse({
      type: "Note",
      relatedKind: "None",
    });
    expect(r.success).toBe(true);
  });

  it("accepts a standalone activity with an explicitly omitted/blank id", () => {
    const r = createActivitySchema.safeParse({
      type: "Note",
      relatedKind: "None",
      relatedObjectId: "",
    });
    expect(r.success).toBe(true);
  });

  it("REJECTS a linked activity (Lead) without a relatedObjectId — backward compat", () => {
    const r = createActivitySchema.safeParse({
      type: "Note",
      relatedKind: "Lead",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const fieldErrors = r.error.flatten().fieldErrors;
      expect(fieldErrors.relatedObjectId).toBeTruthy();
    }
  });

  it("REJECTS a linked activity (Lead) with a blank relatedObjectId", () => {
    const r = createActivitySchema.safeParse({
      type: "Note",
      relatedKind: "Lead",
      relatedObjectId: "   ",
    });
    expect(r.success).toBe(false);
  });

  it("still accepts an existing linked activity exactly as before", () => {
    const r = createActivitySchema.safeParse({
      type: "Call",
      relatedKind: "Lead",
      relatedObjectId: "lead-123",
      activityTypeId: "at-1",
      fieldValues: { bid: 250 },
    });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown relatedKind", () => {
    const r = createActivitySchema.safeParse({
      type: "Note",
      relatedKind: "Banana",
      relatedObjectId: "x",
    });
    expect(r.success).toBe(false);
  });
});
