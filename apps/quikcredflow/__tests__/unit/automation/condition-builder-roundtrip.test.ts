/**
 * [P3.A4] Cross-check: the config the ConditionBuilder emits round-trips to a
 * definition the engine actually runs. Proves R1 (substatus IN […] AND stage IN
 * […]) is expressible from the panel and evaluates correctly via the P1.2
 * evaluator the engine uses. (SPEC §2, §9 · cross-ref P1.3)
 */
import { describe, expect, it } from "vitest";
import { mockDb } from "../../helpers/mockDb";
import type { QcfLead } from "@quikit/database";
import { evalIfElse } from "@/lib/services/automation/workflow-engine";
import {
  formatConditionValue,
  parseConditionValue,
} from "@/app/(dashboard)/automations/workflows/builder/condition-builder";
import type { IfElseConfig, WorkflowCondition } from "@/types/workflow";

mockDb(); // activate the @quikit/database mock so importing the engine is safe

const lead = (over: Partial<Record<string, unknown>>) => over as unknown as QcfLead;

describe("ConditionBuilder value transform", () => {
  it("parses a comma-separated IN list into a trimmed array", () => {
    expect(parseConditionValue("in", "Demo, Student Lead ,  Negotiation ")).toEqual([
      "Demo",
      "Student Lead",
      "Negotiation",
    ]);
  });

  it("formats an IN array back to comma-separated text (round-trip)", () => {
    const arr = ["a", "b", "c"];
    expect(formatConditionValue("in", arr)).toBe("a, b, c");
    expect(parseConditionValue("in", formatConditionValue("in", arr))).toEqual(arr);
  });

  it("valueless operators carry no value", () => {
    expect(parseConditionValue("is_defined", "ignored")).toBeUndefined();
    expect(formatConditionValue("is_not_defined", "x")).toBe("");
  });
});

describe("R1 config from the panel is engine-runnable", () => {
  // Built exactly as ConditionBuilder emits: group form, connector AND, IN arrays.
  const substatusVals = ["s1", "s2", "s3", "s4", "s5", "s6", "s7"]; // 7 values
  const stageVals = Array.from({ length: 15 }, (_, i) => `stage${i + 1}`); // 15 values
  const cfg: IfElseConfig = {
    connector: "AND",
    conditions: [
      { field: "substatus", op: "in", value: parseConditionValue("in", substatusVals.join(", ")) } as WorkflowCondition,
      { field: "stage", op: "in", value: parseConditionValue("in", stageVals.join(", ")) } as WorkflowCondition,
    ],
  };

  it("true only when BOTH the substatus and stage are in their sets", () => {
    expect(evalIfElse(lead({ substatus: "s4", stage: "stage9" }), cfg)).toBe(true);
  });

  it("false when substatus matches but stage does not", () => {
    expect(evalIfElse(lead({ substatus: "s4", stage: "closed" }), cfg)).toBe(false);
  });

  it("false when a keyed field is null (nullable-safe)", () => {
    expect(evalIfElse(lead({ substatus: null, stage: "stage9" }), cfg)).toBe(false);
  });
});
