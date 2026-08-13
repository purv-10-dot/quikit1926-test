/**
 * FR-RE Stage 3-C — the pure Option-Y payload builder for the clean disposition
 * view's Save button. The clean form has no disposition picker, so the payload
 * it posts must:
 *   - OMIT callDispositionId entirely (server resolves the internal "Call"),
 *   - carry status (the single required pick) + subStage / notes /
 *     activityDateTime / dispositionFieldValues,
 *   - carry NONE of the legacy reason / demo / nextStage gates.
 *
 * It also OWNS the clean view's hard-required guard so the Save button blocks on
 * empty Status (and any hard-required custom field) instead of posting blindly —
 * this is what the modal's submit calls, the same function the test asserts (no
 * mirror — the activityHeadline pattern).
 *
 * RED until lib/services/forms/clean-call-log-payload.ts exists.
 */
import { describe, it, expect } from "vitest";
import { buildCleanCallLogPayload } from "@/lib/services/forms/clean-call-log-payload";

const base = {
  toNumber: "9888800001",
  leadId: "lead_1",
  status: "Renewal Done",
  subStage: "",
  notes: "spoke to customer",
  dateTimeValue: "2026-06-02T11:18",
  fieldValues: { testing_field: "x" } as Record<string, string>,
  // Hard-required protected/custom fields the form declares (fieldKey list).
  hardRequiredFieldKeys: [] as string[],
};

describe("buildCleanCallLogPayload — Option-Y payload + hard-required guard", () => {
  it("omits callDispositionId and sets status + carried fields", () => {
    const result = buildCleanCallLogPayload(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = result.payload;
    expect("callDispositionId" in p).toBe(false); // server resolves internal "Call"
    expect(p.status).toBe("Renewal Done");
    expect(p.notes).toBe("spoke to customer");
    expect(p.dispositionFieldValues).toEqual({ testing_field: "x" });
    // ISO datetime carried (FR-D2).
    expect(p.activityDateTime).toBe(new Date("2026-06-02T11:18").toISOString());
    expect(p.toNumber).toBe("9888800001");
    expect(p.linkedLeadId).toBe("lead_1");
  });

  it("carries NONE of the legacy reason / demo / nextStage gates", () => {
    const result = buildCleanCallLogPayload(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = result.payload as unknown as Record<string, unknown>;
    expect("reason" in p).toBe(false);
    expect("demoScheduledBy" in p).toBe(false);
    expect("demoScheduledOn" in p).toBe(false);
    expect("nextStage" in p).toBe(false);
  });

  it("BLOCKS on empty Status (the single required pick) — does not post blindly", () => {
    const result = buildCleanCallLogPayload({ ...base, status: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/status/i);
  });

  it("BLOCKS when a hard-required custom field is empty", () => {
    const result = buildCleanCallLogPayload({
      ...base,
      fieldValues: {},
      hardRequiredFieldKeys: ["testing_field"],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/testing_field/i);
  });

  it("passes when hard-required custom fields are filled", () => {
    const result = buildCleanCallLogPayload({
      ...base,
      fieldValues: { testing_field: "filled" },
      hardRequiredFieldKeys: ["testing_field"],
    });
    expect(result.ok).toBe(true);
  });
});

describe("buildCleanCallLogPayload — Activity datetime is WYSIWYG (displayed instant, not save-time)", () => {
  it("a present dateTimeValue persists as that exact INSTANT (not undefined)", () => {
    const result = buildCleanCallLogPayload({ ...base, dateTimeValue: "2026-06-18T09:30" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Assert the INSTANT (toISOString of the local wall-clock), not a string —
    // datetime-local is local; toISOString is UTC; same moment, tz-independent.
    expect(result.payload.activityDateTime).toBe(new Date("2026-06-18T09:30").toISOString());
    expect(result.payload.activityDateTime).not.toBeUndefined();
  });

  it("an edited value persists as ITS instant (proves the edit, not a default)", () => {
    const result = buildCleanCallLogPayload({ ...base, dateTimeValue: "2026-06-20T16:45" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.activityDateTime).toBe(new Date("2026-06-20T16:45").toISOString());
  });
});
