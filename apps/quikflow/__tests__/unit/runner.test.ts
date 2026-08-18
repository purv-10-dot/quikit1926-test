import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Prisma } from "@quikit/database";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { runWorkflow } from "@/lib/engine/runner";
import * as actions from "@/lib/engine/actions";
import type { EngineEvent } from "@/lib/engine/types";

const event: EngineEvent = {
  app: "quikscale",
  event: "kpi.below_target",
  orgId: "org_A",
  dedupeKey: "evt1",
  data: { value: 40, target: 100 },
};

const workflow = {
  id: "wf1",
  trigger: { app: "quikscale", event: "kpi.below_target" },
  graphNodes: [
    { id: "t", kind: "trigger", label: "KPI below target" },
    { id: "a", kind: "action", label: "Notify owner", config: { actionId: "notify_owner" } },
  ],
  graphEdges: [{ from: "t", to: "a" }],
};

// Enriched evaluation context (normally built by loadContext). For these unit
// tests the raw event data doubles as both the flat `data` and token `trigger`.
const context = { data: event.data, trigger: event.data, moduleKey: null, record: null };

beforeEach(() => resetMockDb());
afterEach(() => vi.restoreAllMocks());

describe("runWorkflow", () => {
  it("walks trigger → action, writes a WfRun + one WfStepLog per node, succeeds", async () => {
    mockDb.wfRun.findUnique.mockResolvedValue(null);
    mockDb.wfRun.create.mockResolvedValue({ id: "run1" } as never);
    mockDb.wfStepLog.create.mockResolvedValue({} as never);
    mockDb.wfRun.update.mockResolvedValue({} as never);
    mockDb.wfWorkflow.update.mockResolvedValue({} as never);

    const result = await runWorkflow(workflow, event, "evt1:wf1", context);

    expect(result).not.toBeNull();
    expect(result!.status).toBe("success");
    expect(result!.steps).toBe(2);
    expect(mockDb.wfRun.create.mock.calls[0][0].data.orgId).toBe("org_A");
    expect(mockDb.wfStepLog.create).toHaveBeenCalledTimes(2);
    // finalizes run + stamps workflow.lastRunAt/lastRunStatus
    expect(mockDb.wfRun.update.mock.calls[0][0].data.status).toBe("success");
    expect(mockDb.wfWorkflow.update.mock.calls[0][0].data.lastRunStatus).toBe("success");
  });

  it("stamps workflow.lastRunStatus = 'failed' when a step fails, so a broken workflow is visible without opening Run History", async () => {
    // Regression: WfRun.status flips to "failed" on a failed step, but before
    // this fix WfWorkflow.lastRunStatus was never written at all — a workflow
    // could fail on every single trigger and still show as "Live" forever.
    mockDb.wfRun.findUnique.mockResolvedValue(null);
    mockDb.wfRun.create.mockResolvedValue({ id: "run3" } as never);
    mockDb.wfStepLog.create.mockResolvedValue({} as never);
    mockDb.wfRun.update.mockResolvedValue({} as never);
    mockDb.wfWorkflow.update.mockResolvedValue({} as never);
    vi.spyOn(actions, "getActionExecutor").mockReturnValue(async () => ({ status: "failed", error: "boom" }));

    const failingWorkflow = {
      id: "wf3",
      graphNodes: [
        { id: "t", kind: "trigger" },
        { id: "a", kind: "action", config: { actionId: "notify_owner" } },
      ],
      graphEdges: [{ from: "t", to: "a" }],
    };

    const result = await runWorkflow(failingWorkflow, event, "evt3:wf3", context);

    expect(result!.status).toBe("failed");
    expect(mockDb.wfRun.update.mock.calls[0][0].data.status).toBe("failed");
    expect(mockDb.wfWorkflow.update).toHaveBeenCalledWith({
      where: { id: "wf3" },
      data: { lastRunAt: expect.any(Date), lastRunStatus: "failed" },
    });
  });

  it("is idempotent — a duplicate (orgId, dedupeKey) returns null without a new run", async () => {
    mockDb.wfRun.findUnique.mockResolvedValue({ id: "run1", status: "success" } as never);
    const result = await runWorkflow(workflow, event, "evt1:wf1", context);
    expect(result).toBeNull();
    expect(mockDb.wfRun.create).not.toHaveBeenCalled();
  });

  it("a TOCTOU race on WfRun.create (P2002 after a concurrent winner) returns null, not a thrown error", async () => {
    // Both racers pass findUnique (neither has committed yet), then this
    // caller loses the DB's unique(orgId, dedupeKey) race on create().
    mockDb.wfRun.findUnique.mockResolvedValue(null);
    mockDb.wfRun.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    const result = await runWorkflow(workflow, event, "evt1:wf1", context);

    expect(result).toBeNull();
    expect(mockDb.wfStepLog.create).not.toHaveBeenCalled();
  });

  it("re-throws a WfRun.create failure that isn't the P2002 race", async () => {
    mockDb.wfRun.findUnique.mockResolvedValue(null);
    mockDb.wfRun.create.mockRejectedValue(new Error("connection lost"));

    await expect(runWorkflow(workflow, event, "evt1:wf1", context)).rejects.toThrow("connection lost");
  });

  it("stops and skips the action when a condition is false", async () => {
    mockDb.wfRun.findUnique.mockResolvedValue(null);
    mockDb.wfRun.create.mockResolvedValue({ id: "run2" } as never);
    mockDb.wfStepLog.create.mockResolvedValue({} as never);
    mockDb.wfRun.update.mockResolvedValue({} as never);
    mockDb.wfWorkflow.update.mockResolvedValue({} as never);

    const wf = {
      id: "wf2",
      graphNodes: [
        { id: "t", kind: "trigger" },
        { id: "c", kind: "condition", config: { field: "value", operator: "gt", value: 1000 } },
        { id: "a", kind: "action", config: { actionId: "notify_owner" } },
      ],
      graphEdges: [
        { from: "t", to: "c" },
        { from: "c", to: "a" },
      ],
    };
    const result = await runWorkflow(wf, event, "evt2:wf2", context);
    expect(result!.status).toBe("success");
    // trigger + condition executed; action never reached (condition stopped)
    expect(result!.steps).toBe(2);
  });
});
