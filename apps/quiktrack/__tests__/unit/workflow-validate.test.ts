import { describe, it, expect } from "vitest";
import { validateWorkflowGraph } from "@/lib/services/workflow/validate-graph";
import type { ValidatableGraph } from "@/lib/services/workflow/validate-graph";
import type { GraphTransition } from "@/lib/services/workflow/types";

const tr = (o: Partial<GraphTransition> & { id: string }): GraphTransition => ({
  name: o.id,
  type: "NORMAL",
  toStatusId: "b",
  fromStatusIds: [],
  rules: [],
  ...o,
});

// Valid: a → b → c, initial → a.
const valid: ValidatableGraph = {
  statusIds: ["a", "b", "c"],
  transitions: [
    tr({ id: "init", type: "INITIAL", toStatusId: "a" }),
    tr({ id: "t1", toStatusId: "b", fromStatusIds: ["a"] }),
    tr({ id: "t2", toStatusId: "c", fromStatusIds: ["b"] }),
  ],
};

describe("validateWorkflowGraph", () => {
  it("accepts a valid, fully-reachable graph", () => {
    const r = validateWorkflowGraph(valid);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("rejects a graph with no initial transition", () => {
    const r = validateWorkflowGraph({
      statusIds: ["a"],
      transitions: [tr({ id: "t1", toStatusId: "a", fromStatusIds: ["a"] })],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.code)).toContain("NO_INITIAL");
  });

  it("rejects multiple initial transitions", () => {
    const r = validateWorkflowGraph({
      statusIds: ["a", "b"],
      transitions: [
        tr({ id: "i1", type: "INITIAL", toStatusId: "a" }),
        tr({ id: "i2", type: "INITIAL", toStatusId: "b" }),
      ],
    });
    expect(r.errors.map((e) => e.code)).toContain("MULTIPLE_INITIAL");
  });

  it("flags an unreachable status", () => {
    const r = validateWorkflowGraph({
      statusIds: ["a", "b", "orphan"],
      transitions: [
        tr({ id: "init", type: "INITIAL", toStatusId: "a" }),
        tr({ id: "t1", toStatusId: "b", fromStatusIds: ["a"] }),
      ],
    });
    expect(r.ok).toBe(false);
    const unreachable = r.errors.filter((e) => e.code === "UNREACHABLE_STATUS");
    expect(unreachable).toHaveLength(1);
    expect(unreachable[0].statusId).toBe("orphan");
  });

  it("treats a GLOBAL transition's target as reachable from anywhere", () => {
    const r = validateWorkflowGraph({
      statusIds: ["a", "cancelled"],
      transitions: [
        tr({ id: "init", type: "INITIAL", toStatusId: "a" }),
        tr({ id: "cancel", type: "GLOBAL", toStatusId: "cancelled", fromStatusIds: [] }),
      ],
    });
    expect(r.ok).toBe(true);
  });

  it("flags a transition targeting a non-node", () => {
    const r = validateWorkflowGraph({
      statusIds: ["a"],
      transitions: [
        tr({ id: "init", type: "INITIAL", toStatusId: "a" }),
        tr({ id: "t1", toStatusId: "ghost", fromStatusIds: ["a"] }),
      ],
    });
    expect(r.errors.map((e) => e.code)).toContain("TARGET_NOT_NODE");
  });

  it("flags duplicate transition names (case-insensitive)", () => {
    const r = validateWorkflowGraph({
      statusIds: ["a", "b"],
      transitions: [
        tr({ id: "init", type: "INITIAL", toStatusId: "a" }),
        tr({ id: "t1", name: "Go", toStatusId: "b", fromStatusIds: ["a"] }),
        tr({ id: "t2", name: "go", toStatusId: "a", fromStatusIds: ["b"] }),
      ],
    });
    expect(r.errors.map((e) => e.code)).toContain("DUPLICATE_TRANSITION_NAME");
  });
});
