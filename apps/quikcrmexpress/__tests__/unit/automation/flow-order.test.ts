/**
 * [P3.A3] Vertical-flow ordering <-> engine graph round-trip. Proves the shell's
 * linear model serializes to the graph the engine runs (if_else edges tagged
 * branch:"true"; a false condition has no edge → run stops). (SPEC §9, §2)
 */
import { describe, expect, it } from "vitest";
import { graphFromOrder, orderFromGraph } from "@/app/(dashboard)/automations/workflows/builder/flow-order";
import type { WorkflowNode } from "@/types/workflow";

const n = (id: string, kind: WorkflowNode["kind"]): WorkflowNode => ({ id, kind, config: {} });

describe("graphFromOrder", () => {
  it("connects consecutive nodes and derives the trigger type", () => {
    const order = [n("t", "trigger_lead_created"), n("f", "update_lead_field")];
    const g = graphFromOrder(order);
    expect(g.triggerType).toBe("trigger_lead_created");
    expect(g.graphEdges).toEqual([{ from: "t", to: "f" }]);
  });

  it("tags an edge leaving an if_else with branch:'true' (gate semantics)", () => {
    const order = [n("t", "trigger_lead_updated"), n("c", "if_else"), n("u", "update_lead_field")];
    const g = graphFromOrder(order);
    expect(g.graphEdges).toEqual([
      { from: "t", to: "c" },
      { from: "c", to: "u", branch: "true" },
    ]);
  });

  it("emits no edges for a trigger-only flow", () => {
    expect(graphFromOrder([n("t", "trigger_lead_created")]).graphEdges).toEqual([]);
  });
});

describe("orderFromGraph round-trips graphFromOrder", () => {
  it("rebuilds the linear order by walking edges from the trigger", () => {
    const order = [
      n("t", "trigger_lead_created"),
      n("c", "if_else"),
      n("u", "update_lead_field"),
      n("w", "wait"),
    ];
    const g = graphFromOrder(order);
    const back = orderFromGraph(g.graphNodes, g.graphEdges, g.triggerType);
    expect(back.map((x) => x.id)).toEqual(["t", "c", "u", "w"]);
  });

  it("appends orphan nodes not reachable from the trigger (nothing dropped)", () => {
    const nodes = [n("t", "trigger_lead_created"), n("u", "update_lead_field"), n("orphan", "wait")];
    const edges = [{ from: "t", to: "u" }];
    const back = orderFromGraph(nodes, edges, "trigger_lead_created");
    expect(back.map((x) => x.id)).toEqual(["t", "u", "orphan"]);
  });

  it("returns [] for an empty graph", () => {
    expect(orderFromGraph([], [], null)).toEqual([]);
  });
});
