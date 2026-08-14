import { describe, it, expect } from "vitest";
import { CONDITION_REGISTRY } from "@/lib/services/workflow/rules/conditions";
import type { RuleContext, TransitionHistoryEntry } from "@/lib/services/workflow/rules/context";

const handler = CONDITION_REGISTRY.restrict_been_through_status;

/** currentStatus + an ordered list of statuses the item entered (toStatusId). */
function ctx(currentStatus: string, entered: string[]): RuleContext {
  const history: TransitionHistoryEntry[] = entered.map((s, i) => ({
    fromStatusId: i === 0 ? null : entered[i - 1],
    toStatusId: s,
    actorId: null,
  }));
  return {
    userId: "u1",
    issue: {
      id: "i1", orgId: "o1", projectId: "p1", type: "TASK",
      statusId: currentStatus, assigneeId: null, resolutionId: null, priority: null,
    },
    toStatusId: "resolved",
    toStatusCategory: "DONE",
    inputs: {},
    prim: {
      userInProjectRole: async () => false,
      userCanInProject: async () => false,
      subtaskStatusIds: async () => [],
      transitionHistory: async () => history,
      parentStatusId: async () => null,
      projectLeadId: async () => null,
      parentFieldValue: async () => null,
    },
  };
}

describe("restrict_been_through_status condition", () => {
  it("requires at least one status", () => {
    expect(handler.validateConfig?.({})).toEqual(["Pick at least one status"]);
    expect(handler.validateConfig?.({ statusIds: ["x"] })).toEqual([]);
  });

  it("no config selected → no restriction (passes)", async () => {
    expect(await handler.evaluate(ctx("open", ["open"]), {})).toBe(true);
  });

  it("passes when the item has entered one of the selected statuses", async () => {
    const cfg = { statusIds: ["in_progress"] };
    expect(await handler.evaluate(ctx("resolved", ["open", "in_progress", "resolved"]), cfg)).toBe(true);
    expect(await handler.evaluate(ctx("resolved", ["open", "resolved"]), cfg)).toBe(false);
  });

  it("includeCurrent counts the current status too", async () => {
    // never entered 'resolved' via history, but it IS current
    expect(await handler.evaluate(ctx("resolved", ["open"]), { statusIds: ["resolved"], includeCurrent: true })).toBe(true);
    // without includeCurrent, the current status doesn't count → no match
    expect(await handler.evaluate(ctx("resolved", ["open"]), { statusIds: ["resolved"] })).toBe(false);
  });

  it("reverse: allow only if NOT been through", async () => {
    const cfg = { statusIds: ["in_progress"], reverse: true };
    expect(await handler.evaluate(ctx("resolved", ["open", "resolved"]), cfg)).toBe(true); // never in_progress
    expect(await handler.evaluate(ctx("resolved", ["open", "in_progress", "resolved"]), cfg)).toBe(false);
  });

  it("mostRecentOnly checks only the status just prior to current", async () => {
    // entered: open → in_progress → reopened (current). Prior status = in_progress.
    const cfg = { statusIds: ["in_progress"], mostRecentOnly: true };
    expect(await handler.evaluate(ctx("reopened", ["open", "in_progress", "reopened"]), cfg)).toBe(true);
    // prior status is 'open', not 'in_progress' → no match
    expect(await handler.evaluate(ctx("in_progress", ["open", "in_progress"]), cfg)).toBe(false);
  });

  it("ignoreLoops drops transitions whose target equals current status", async () => {
    // entered: open → in_progress → in_progress(loop) with current in_progress.
    // Without ignoreLoops, prior (non-current) status is 'open'.
    const cfg = { statusIds: ["open"], mostRecentOnly: true, ignoreLoops: true };
    expect(await handler.evaluate(ctx("in_progress", ["open", "in_progress", "in_progress"]), cfg)).toBe(true);
  });
});
