import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { matchWorkflows } from "@/lib/engine/matcher";
import type { EngineEvent } from "@/lib/engine/types";

const event: EngineEvent = {
  app: "quikscale",
  event: "kpi.below_target",
  orgId: "org_A",
  dedupeKey: "e",
  data: {},
};

beforeEach(() => resetMockDb());

describe("matchWorkflows", () => {
  it("queries only the event's org + Active status, and matches on trigger app+event", async () => {
    mockDb.wfWorkflow.findMany.mockResolvedValue([
      { id: "wf1", name: "A", trigger: { app: "quikscale", event: "kpi.below_target" }, graphNodes: [], graphEdges: [] },
      { id: "wf2", name: "B", trigger: { app: "quikscale", event: "priority.overdue" }, graphNodes: [], graphEdges: [] },
      { id: "wf3", name: "C", trigger: { app: "quikcrm", event: "kpi.below_target" }, graphNodes: [], graphEdges: [] },
    ] as never);

    const matched = await matchWorkflows(event);

    const where = mockDb.wfWorkflow.findMany.mock.calls[0][0]?.where;
    expect(where?.orgId).toBe("org_A");
    expect(where?.status).toBe("Active");
    expect(matched.map((m) => m.id)).toEqual(["wf1"]);
  });

  it("excludes soft-deleted workflows so a deleted automation never fires again", async () => {
    mockDb.wfWorkflow.findMany.mockResolvedValue([]);

    await matchWorkflows(event);

    const where = mockDb.wfWorkflow.findMany.mock.calls[0][0]?.where;
    expect(where?.deletedAt).toBeNull();
  });
});
