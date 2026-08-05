import { describe, it, expect } from "vitest";
import { CONDITION_REGISTRY } from "@/lib/services/workflow/rules/conditions";
import type { RuleContext, TransitionHistoryEntry } from "@/lib/services/workflow/rules/context";

const handler = CONDITION_REGISTRY.restrict_previous_updater;

function ctx(userId: string, history: TransitionHistoryEntry[]): RuleContext {
  return {
    userId,
    issue: {
      id: "i1", orgId: "o1", projectId: "p1", type: "TASK",
      statusId: "reopened", assigneeId: null, resolutionId: null, priority: null,
    },
    toStatusId: "resolved",
    toStatusCategory: "DONE",
    inputs: {},
    prim: {
      userInProjectRole: async () => false,
      userCanInProject: async () => false,
      subtaskStatusIds: async () => [],
      transitionHistory: async () => history,
    },
  };
}

const move = (actorId: string | null, from: string | null, to: string): TransitionHistoryEntry => ({
  fromStatusId: from,
  toStatusId: to,
  actorId,
});

describe("restrict_previous_updater condition", () => {
  it("requires a 'to' status", () => {
    expect(handler.validateConfig?.({})).toEqual(["Choose the 'to' status"]);
    expect(handler.validateConfig?.({ toStatusId: "resolved" })).toEqual([]);
  });

  it("incomplete config → no restriction (passes)", async () => {
    expect(await handler.evaluate(ctx("u1", [move("u1", "in_progress", "resolved")]), {})).toBe(true);
  });

  it("blocks the user who previously made the exact from→to move", async () => {
    const cfg = { fromStatusId: "in_progress", toStatusId: "resolved" };
    const hist = [move("u1", "in_progress", "resolved")];
    expect(await handler.evaluate(ctx("u1", hist), cfg)).toBe(false); // same user → blocked
    expect(await handler.evaluate(ctx("u2", hist), cfg)).toBe(true); // different user → allowed
  });

  it("does not block when the prior move's 'from' differs", async () => {
    const cfg = { fromStatusId: "in_progress", toStatusId: "resolved" };
    expect(await handler.evaluate(ctx("u1", [move("u1", "reopened", "resolved")]), cfg)).toBe(true);
  });

  it("'any' from-status matches a move to the target from any source", async () => {
    const cfg = { fromStatusId: "any", toStatusId: "resolved" };
    expect(await handler.evaluate(ctx("u1", [move("u1", "reopened", "resolved")]), cfg)).toBe(false);
    expect(await handler.evaluate(ctx("u1", [move("u1", "open", "in_progress")]), cfg)).toBe(true);
  });

  it("ignores history entries with no actor", async () => {
    const cfg = { fromStatusId: "any", toStatusId: "resolved" };
    expect(await handler.evaluate(ctx("u1", [move(null, "in_progress", "resolved")]), cfg)).toBe(true);
  });
});
