import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";

const { runSingleWorkflow } = vi.hoisted(() => ({
  runSingleWorkflow: vi.fn(async () => ({
    runId: "run1",
    workflowId: "wf1",
    status: "success",
    steps: 2,
    durationMs: 5,
  })),
}));
vi.mock("@/lib/engine", () => ({ runSingleWorkflow }));

import { POST } from "@/app/api/workflows/[id]/run/route";

function req() {
  return new NextRequest(new URL("http://localhost/api/workflows/wf1/run"), { method: "POST" });
}

const USER = { id: "u1", orgId: "org_A", membershipRole: "employee" };

beforeEach(() => {
  resetMockDb();
  runSingleWorkflow.mockClear();
});

describe("POST /api/workflows/:id/run", () => {
  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await POST(req(), { params: { id: "wf1" } });
    expect(res.status).toBe(401);
  });

  it("404s when the workflow is not visible to the caller (cross-org isolation)", async () => {
    setSession(USER);
    mockDb.wfWorkflow.findFirst.mockResolvedValue(null);
    const res = await POST(req(), { params: { id: "wf1" } });
    expect(res.status).toBe(404);
    expect(mockDb.wfWorkflow.findFirst.mock.calls[0][0]?.where?.orgId).toBe("org_A");
    expect(runSingleWorkflow).not.toHaveBeenCalled();
  });

  it("runs the workflow and returns the run result", async () => {
    setSession(USER);
    mockDb.wfWorkflow.findFirst.mockResolvedValue({
      id: "wf1",
      trigger: { app: "quikscale", event: "kpi.below_target" },
      graphNodes: [],
      graphEdges: [],
    } as never);

    const res = await POST(req(), { params: { id: "wf1" } });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.run.status).toBe("success");
    expect(runSingleWorkflow).toHaveBeenCalledTimes(1);
  });
});
