/**
 * [P1.2] if_else evaluator — multi-value IN + AND group + nullable-safe +
 * backward compatibility with the legacy single-condition shape. (SPEC §2)
 */
import { describe, expect, it } from "vitest";
import { mockDb } from "../../helpers/mockDb";
import type { CrmLead } from "@quikit/database";
import { evalIfElse, evalCondition } from "@/lib/services/automation/workflow-engine";
import type { IfElseConfig } from "@/types/workflow";

mockDb(); // activate the @quikit/database mock so importing the engine is safe

const lead = (over: Partial<Record<string, unknown>>) => over as unknown as CrmLead;

describe("evalIfElse · multi-value IN", () => {
  const cfg: IfElseConfig = {
    conditions: [{ field: "substatus", op: "in", value: ["Negotiation", "Demo Now", "Student Lead"] }],
  };
  it("true when current value is in the list", () => {
    expect(evalIfElse(lead({ substatus: "Student Lead" }), cfg)).toBe(true);
  });
  it("false when current value is not in the list", () => {
    expect(evalIfElse(lead({ substatus: "Support Issue" }), cfg)).toBe(false);
  });
  it("false for a non-array IN value (malformed rule) — no throw", () => {
    expect(evalIfElse(lead({ substatus: "x" }), { conditions: [{ field: "substatus", op: "in", value: "x" }] })).toBe(false);
  });
});

describe("evalIfElse · AND across conditions (substatus IN … AND stage IN …)", () => {
  const cfg: IfElseConfig = {
    conditions: [
      { field: "substatus", op: "in", value: ["Student Lead", "Language Barrier"] },
      { field: "stage", op: "in", value: ["New Lead", "Not Connected", "Future Lead"] },
    ],
  };
  it("true only when BOTH hold", () => {
    expect(evalIfElse(lead({ substatus: "Student Lead", stage: "New Lead" }), cfg)).toBe(true);
  });
  it("false when substatus matches but stage does not", () => {
    expect(evalIfElse(lead({ substatus: "Student Lead", stage: "Disqualified" }), cfg)).toBe(false);
  });
  it("false when stage matches but substatus does not", () => {
    expect(evalIfElse(lead({ substatus: "Support Issue", stage: "New Lead" }), cfg)).toBe(false);
  });
  it("empty condition group is false", () => {
    expect(evalIfElse(lead({ stage: "New Lead" }), { conditions: [] })).toBe(false);
  });
});

describe("evalIfElse · nullable-field safety (status: null)", () => {
  it("IN against a null field is a deterministic false, not a crash", () => {
    expect(evalIfElse(lead({ status: null }), { conditions: [{ field: "status", op: "in", value: ["Open"] }] })).toBe(false);
  });
  it("is_defined is false for null, true for a value", () => {
    expect(evalCondition(lead({ status: null }), { field: "status", op: "is_defined" })).toBe(false);
    expect(evalCondition(lead({ status: "Open" }), { field: "status", op: "is_defined" })).toBe(true);
  });
  it("is_not_defined is true for null/empty, false for a value", () => {
    expect(evalCondition(lead({ status: null }), { field: "status", op: "is_not_defined" })).toBe(true);
    expect(evalCondition(lead({ status: "" }), { field: "status", op: "is_not_defined" })).toBe(true);
    expect(evalCondition(lead({ status: "Open" }), { field: "status", op: "is_not_defined" })).toBe(false);
  });
});

describe("evalIfElse · legacy single-condition shape still works", () => {
  it("eq", () => {
    expect(evalIfElse(lead({ stage: "New Lead" }), { field: "stage", op: "eq", value: "New Lead" })).toBe(true);
    expect(evalIfElse(lead({ stage: "New Lead" }), { field: "stage", op: "eq", value: "Other" })).toBe(false);
  });
  it("neq / contains / gt / lt", () => {
    expect(evalIfElse(lead({ stage: "New Lead" }), { field: "stage", op: "neq", value: "Other" })).toBe(true);
    expect(evalIfElse(lead({ name: "Acme Corp" }), { field: "name", op: "contains", value: "acme" })).toBe(true);
    expect(evalIfElse(lead({ score: 80 }), { field: "score", op: "gt", value: 50 })).toBe(true);
    expect(evalIfElse(lead({ score: 20 }), { field: "score", op: "lt", value: 50 })).toBe(true);
  });
  it("exists/absent aliases preserved", () => {
    expect(evalCondition(lead({ status: "Open" }), { field: "status", op: "exists" })).toBe(true);
    expect(evalCondition(lead({ status: null }), { field: "status", op: "absent" })).toBe(true);
  });
  it("missing field → false (no throw)", () => {
    expect(evalIfElse(lead({}), {})).toBe(false);
  });
});
