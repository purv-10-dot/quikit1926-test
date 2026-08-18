import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET } from "@/app/api/runs/[id]/route";

function req() {
  return new NextRequest(new URL("http://localhost/api/runs/run1"));
}

const USER = { id: "u1", orgId: "org_A", membershipRole: "employee" };

beforeEach(() => resetMockDb());

describe("GET /api/runs/:id", () => {
  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await GET(req(), { params: { id: "run1" } });
    expect(res.status).toBe(401);
  });

  it("404s + scopes to the caller's org (isolation)", async () => {
    setSession(USER);
    mockDb.wfRun.findFirst.mockResolvedValue(null);
    const res = await GET(req(), { params: { id: "run1" } });
    expect(res.status).toBe(404);
    expect(mockDb.wfRun.findFirst.mock.calls[0][0]?.where?.orgId).toBe("org_A");
  });

  it("returns the run with its step timeline", async () => {
    setSession(USER);
    mockDb.wfRun.findFirst.mockResolvedValue({
      id: "run1",
      status: "success",
      startedAt: new Date(),
      finishedAt: new Date(),
      durationMs: 12,
      error: null,
      workflow: { name: "Alert on slipping KPI", app: "quikscale" },
      steps: [{ id: "s1", nodeId: "t", kind: "trigger", status: "ok", output: {}, error: null }],
    } as never);
    const res = await GET(req(), { params: { id: "run1" } });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.workflow.name).toBe("Alert on slipping KPI");
    expect(body.data.steps).toHaveLength(1);
  });
});
