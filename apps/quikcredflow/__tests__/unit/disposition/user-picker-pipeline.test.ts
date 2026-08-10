/**
 * user_picker — the CLIENT-LAYER value pipeline must carry string[] for a multi
 * selection, end to end, so it reaches the (already array-capable) save service
 * as N ids — not a coerced "id1,id2" single string that writes ONE corrupt
 * valueUserIds record.
 *
 * The save DESTINATION is already locked green by
 * disposition-save.integration.test.ts (verifiers: ["u1","u2"] -> valueUserIds
 * length 2, alongside a single-value dropdown round-trip). The gap is the CLIENT
 * builder: buildCleanCallLogPayload.fieldValues is typed Record<string, string>,
 * so a multi value coerces to a string before it ever reaches the wire.
 *
 * RED: passing string[] does not even compile/typecheck against Record<string,
 * string> — the type IS the coercion bug. Widening hops 1-3 to
 * Record<string, string | string[]> makes this pass. The additive case (a plain
 * string field still round-trips) is asserted so the widening can't regress the
 * already-fine single-value fields.
 */
import { describe, it, expect } from "vitest";
import { buildCleanCallLogPayload } from "@/lib/services/forms/clean-call-log-payload";

const base = {
  toNumber: "9888800001",
  leadId: "lead_1",
  status: "Renewal Done",
  subStage: "",
  notes: "",
  dateTimeValue: "2026-06-18T09:30",
  hardRequiredFieldKeys: [] as string[],
};

describe("buildCleanCallLogPayload — multi user_picker carries string[] (no coercion)", () => {
  it("a string[] field value survives as an array in dispositionFieldValues", () => {
    const result = buildCleanCallLogPayload({
      ...base,
      // RED until fieldValues is widened to Record<string, string | string[]>:
      // this assignment is a TYPE ERROR against Record<string, string> today.
      fieldValues: { assignees: ["u1", "u2", "u3"], payment_mode: "invoice" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The array must survive — NOT a joined "u1,u2,u3" string.
    expect(result.payload.dispositionFieldValues).toMatchObject({
      assignees: ["u1", "u2", "u3"],
      payment_mode: "invoice",
    });
    expect(Array.isArray((result.payload.dispositionFieldValues as Record<string, unknown>).assignees)).toBe(true);
  });

  it("ADDITIVE: a plain string field still round-trips unchanged (no regression)", () => {
    const result = buildCleanCallLogPayload({
      ...base,
      fieldValues: { payment_mode: "invoice" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.payload.dispositionFieldValues as Record<string, unknown>).payment_mode).toBe("invoice");
  });
});
