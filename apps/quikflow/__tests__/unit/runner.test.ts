import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { runWorkflow } from "@/lib/engine/runner";
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

beforeEach(() => resetMockDb());

describe("runWorkflow", () => {
  it("walks trigger → action, writes a WfRun + one WfStepLog per node, succeeds", async () => {
    mockDb.wfRun.findUnique.mockResolvedValue(null);
    mockDb.wfRun.create.mockResolvedValue({ id: "run1" } as never);
    mockDb.wfStepLog.create.mockResolvedValue({} as never);
    mockDb.wfRun.update.mockResolvedValue({} as never);
    mockDb.wfWorkflow.update.mockResolvedValue({} as never);

    const result = await runWorkflow(workflow, event, "evt1:wf1");

    expect(result).not.toBeNull();
    expect(result!.status).toBe("success");
    expect(result!.steps).toBe(2);
    expect(mockDb.wfRun.create.mock.calls[0][0].data.orgId).toBe("org_A");
    expect(mockDb.wfStepLog.create).toHaveBeenCalledTimes(2);
    // finalizes run + stamps workflow.lastRunAt
    expect(mockDb.wfRun.update.mock.calls[0][0].data.status).toBe("success");
    expect(mockDb.wfWorkflow.update).toHaveBeenCalled();
  });

  it("is idempotent — a duplicate (orgId, dedupeKey) returns null without a new run", async () => {
    mockDb.wfRun.findUnique.mockResolvedValue({ id: "run1", status: "success" } as never);
    const result = await runWorkflow(workflow, event, "evt1:wf1");
    expect(result).toBeNull();
    expect(mockDb.wfRun.create).not.toHaveBeenCalled();
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
    const result = await runWorkflow(wf, event, "evt2:wf2");
    expect(result!.status).toBe("success");
    // trigger + condition executed; action never reached (condition stopped)
    expect(result!.steps).toBe(2);
  });
});
