import { describe, it, expect } from "vitest";
import { evaluate } from "@/lib/engine/conditions";
import type { EngineEvent, GraphNode } from "@/lib/engine/types";

const event: EngineEvent = {
  app: "quikscale",
  event: "kpi.below_target",
  orgId: "org_A",
  dedupeKey: "k1",
  data: { value: 40, target: 100, gapPct: 60, name: "MRR" },
};

function node(config: Record<string, unknown>): GraphNode {
  return { id: "c1", kind: "condition", config };
}

describe("condition evaluator", () => {
  it("passes when a node has no usable config (basic always-true gate)", () => {
    expect(evaluate({ id: "c", kind: "condition" }, event)).toBe(true);
  });

  it("resolves trigger.<field> and compares with lt/gt/eq", () => {
    expect(evaluate(node({ field: "trigger.value", operator: "lt", value: 100 }), event)).toBe(true);
    expect(evaluate(node({ field: "value", operator: "gt", value: 100 }), event)).toBe(false);
    expect(evaluate(node({ field: "name", operator: "eq", value: "MRR" }), event)).toBe(true);
  });

  it("supports the Example-2 gapPct > 50 escalation gate", () => {
    expect(evaluate(node({ field: "trigger.gapPct", operator: "gt", value: 50 }), event)).toBe(true);
    expect(
      evaluate(node({ field: "trigger.gapPct", operator: "gt", value: 50 }), {
        ...event,
        data: { ...event.data, gapPct: 30 },
      }),
    ).toBe(false);
  });

  it("supports contains / exists / absent", () => {
    expect(evaluate(node({ field: "name", operator: "contains", value: "MR" }), event)).toBe(true);
    expect(evaluate(node({ field: "value", operator: "exists" }), event)).toBe(true);
    expect(evaluate(node({ field: "missing", operator: "absent" }), event)).toBe(true);
  });
});
