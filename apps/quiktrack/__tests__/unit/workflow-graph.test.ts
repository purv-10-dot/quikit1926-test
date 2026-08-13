import { describe, it, expect } from "vitest";
import {
  assertTransitionAllowed,
  findTransition,
  isTransitionAvailableFrom,
  listAvailableTransitions,
} from "@/lib/services/workflow/graph";
import { TransitionNotAllowedError } from "@/lib/services/workflow/types";
import type {
  GraphTransition,
  WorkflowGraph,
} from "@/lib/services/workflow/types";

// Classic default-ish graph: OPEN → IN_PROGRESS → DONE, with a global "Cancel".
const t = (over: Partial<GraphTransition> & { id: string }): GraphTransition => ({
  name: over.id,
  type: "NORMAL",
  toStatusId: "DONE",
  fromStatusIds: [],
  rules: [],
  ...over,
});

const graph: WorkflowGraph = {
  id: "wf1",
  isActive: true,
  transitions: [
    t({ id: "start", type: "NORMAL", toStatusId: "IN_PROGRESS", fromStatusIds: ["OPEN"] }),
    t({ id: "finish", type: "NORMAL", toStatusId: "DONE", fromStatusIds: ["IN_PROGRESS"] }),
    t({ id: "cancel", type: "GLOBAL", toStatusId: "CANCELLED", fromStatusIds: [] }),
    t({ id: "create", type: "INITIAL", toStatusId: "OPEN", fromStatusIds: [] }),
  ],
};

describe("isTransitionAvailableFrom", () => {
  it("NORMAL is available only from a listed source", () => {
    const start = graph.transitions[0];
    expect(isTransitionAvailableFrom(start, "OPEN")).toBe(true);
    expect(isTransitionAvailableFrom(start, "IN_PROGRESS")).toBe(false);
    expect(isTransitionAvailableFrom(start, null)).toBe(false);
  });

  it("GLOBAL is available from any status (incl. null)", () => {
    const cancel = graph.transitions[2];
    expect(isTransitionAvailableFrom(cancel, "OPEN")).toBe(true);
    expect(isTransitionAvailableFrom(cancel, "DONE")).toBe(true);
    expect(isTransitionAvailableFrom(cancel, null)).toBe(true);
  });

  it("INITIAL is never available as a move", () => {
    const create = graph.transitions[3];
    expect(isTransitionAvailableFrom(create, null)).toBe(false);
    expect(isTransitionAvailableFrom(create, "OPEN")).toBe(false);
  });
});

describe("listAvailableTransitions", () => {
  it("from OPEN offers start + global cancel", () => {
    const targets = listAvailableTransitions(graph, "OPEN").map((x) => x.toStatusId);
    expect(targets.sort()).toEqual(["CANCELLED", "IN_PROGRESS"]);
  });

  it("from IN_PROGRESS offers finish + cancel (not start)", () => {
    const targets = listAvailableTransitions(graph, "IN_PROGRESS").map((x) => x.toStatusId);
    expect(targets.sort()).toEqual(["CANCELLED", "DONE"]);
  });

  it("de-duplicates by target status", () => {
    const dup: WorkflowGraph = {
      id: "wf2",
      isActive: true,
      transitions: [
        t({ id: "a", toStatusId: "DONE", fromStatusIds: ["OPEN"] }),
        t({ id: "b", toStatusId: "DONE", fromStatusIds: ["OPEN"] }),
      ],
    };
    expect(listAvailableTransitions(dup, "OPEN")).toHaveLength(1);
  });
});

describe("findTransition", () => {
  it("finds the edge for a legal move", () => {
    expect(findTransition(graph, "OPEN", "IN_PROGRESS")?.id).toBe("start");
    expect(findTransition(graph, "DONE", "CANCELLED")?.id).toBe("cancel");
  });

  it("returns null for an illegal move", () => {
    expect(findTransition(graph, "OPEN", "DONE")).toBeNull();
  });
});

describe("assertTransitionAllowed", () => {
  it("allows a legal move", () => {
    expect(() => assertTransitionAllowed(graph, "OPEN", "IN_PROGRESS")).not.toThrow();
  });

  it("allows a no-op (from === to) even with no self-transition", () => {
    expect(() => assertTransitionAllowed(graph, "DONE", "DONE")).not.toThrow();
  });

  it("throws TransitionNotAllowedError for an illegal move", () => {
    expect(() => assertTransitionAllowed(graph, "OPEN", "DONE")).toThrow(
      TransitionNotAllowedError,
    );
    try {
      assertTransitionAllowed(graph, "OPEN", "DONE");
    } catch (e) {
      expect((e as TransitionNotAllowedError).code).toBe("TRANSITION_NOT_ALLOWED");
    }
  });
});
