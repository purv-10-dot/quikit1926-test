/**
 * "Link to" → Prospect / Upwork on the Log Activity composer.
 *
 * These two kinds are ordinary CrmActivity linkage — no separate activity table
 * and no second activity system. What needs pinning is that they behave like the
 * existing kinds where it matters, and differ ONLY where the underlying records
 * genuinely differ:
 *
 *   - Prospect / Upwork are real, validated, linkable kinds.
 *   - Neither record has an `accountId`, so they resolve to a null account
 *     scope instead of being rejected by the account ACL.
 *   - An Upwork activity's externalId keeps the `<jobId>:` prefix, because that
 *     prefix — not relatedObjectId — is how the job's timeline is queried.
 *   - Existing kinds are untouched.
 */
import { describe, expect, it } from "vitest";
import { createActivitySchema } from "@/lib/validators/activity";
import {
  ACTIVITY_PRIMARY_KINDS,
  isPrimaryKind,
  isAccountlessKind,
} from "@/lib/services/activities/target-existence";
import {
  buildManualUpworkActivityExternalId,
  buildUpworkActivityExternalId,
  upworkActivityExternalIdPrefix,
} from "@/lib/services/activities/upwork-activity-types";

describe("Prospect / Upwork as linkable activity kinds", () => {
  it("registers both as primary (linkable) kinds", () => {
    expect(isPrimaryKind("Prospect")).toBe(true);
    expect(isPrimaryKind("Upwork")).toBe(true);
  });

  it("keeps the pre-existing kinds intact and ordered first", () => {
    // Regression guard: the original four must remain, in their original order,
    // so nothing that indexes into this list shifts meaning.
    expect(ACTIVITY_PRIMARY_KINDS.slice(0, 4)).toEqual([
      "Lead",
      "Opportunity",
      "Contact",
      "Account",
    ]);
  });

  it("treats only Prospect/Upwork as account-less", () => {
    expect(isAccountlessKind("Prospect")).toBe(true);
    expect(isAccountlessKind("Upwork")).toBe(true);
    // The account-owned kinds must still flow through the account ACL.
    for (const k of ["Lead", "Opportunity", "Contact", "Account"]) {
      expect(isAccountlessKind(k)).toBe(false);
    }
  });
});

describe("createActivitySchema — Prospect / Upwork", () => {
  it("accepts a Prospect-linked activity", () => {
    const r = createActivitySchema.safeParse({
      type: "Note",
      relatedKind: "Prospect",
      relatedObjectId: "prospect-1",
    });
    expect(r.success).toBe(true);
  });

  it("accepts an Upwork-linked activity", () => {
    const r = createActivitySchema.safeParse({
      type: "Note",
      relatedKind: "Upwork",
      relatedObjectId: "job-1",
    });
    expect(r.success).toBe(true);
  });

  it("REJECTS either kind without a record id — same rule as Lead", () => {
    for (const relatedKind of ["Prospect", "Upwork"]) {
      const r = createActivitySchema.safeParse({ type: "Note", relatedKind });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.flatten().fieldErrors.relatedObjectId).toBeTruthy();
      }
    }
  });
});

describe("manual Upwork activity externalId", () => {
  const jobId = "job-abc";

  it("carries the job's timeline prefix", () => {
    const key = buildManualUpworkActivityExternalId(jobId, "act-1");
    // This is the whole reason the key is shaped this way: the job timeline
    // queries `externalId startsWith "<jobId>:"`.
    expect(key.startsWith(upworkActivityExternalIdPrefix(jobId))).toBe(true);
  });

  it("never collides with a once-per-job system event key", () => {
    const systemKey = buildUpworkActivityExternalId(
      "UPWORK_JOB_SAVED",
      jobId,
      new Date("2026-08-12T10:00:00.000Z"),
    );
    const manualKey = buildManualUpworkActivityExternalId(jobId, "act-1");
    // A collision would make logActivity() UPSERT over the capture event,
    // silently destroying it.
    expect(manualKey).not.toBe(systemKey);
  });

  it("is unique per activity, so the same type can be logged twice", () => {
    const a = buildManualUpworkActivityExternalId(jobId, "act-1");
    const b = buildManualUpworkActivityExternalId(jobId, "act-2");
    expect(a).not.toBe(b);
  });

  it("does not let one job id prefix-match another", () => {
    // "job" must not match "job-abc" — the trailing colon is what prevents it.
    const key = buildManualUpworkActivityExternalId("job-abc", "act-1");
    expect(key.startsWith(upworkActivityExternalIdPrefix("job"))).toBe(false);
  });
});
