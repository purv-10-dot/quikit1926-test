import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET } from "@/app/api/runs/route";

function req(url: string) {
  return new NextRequest(new URL(url, "http://localhost"));
}

const USER = { id: "u1", orgId: "org_A", membershipRole: "employee" };

beforeEach(() => resetMockDb());

describe("GET /api/runs", () => {
  it("returns 401 when unauthenticated", async () => {
    setSession(null);
    const res = await GET(req("/api/runs"), { params: {} });
    expect(res.status).toBe(401);
  });

  it("scopes runs to the caller's org + visible workflows", async () => {
    setSession(USER);
    mockDb.wfRun.findMany.mockResolvedValue([]);
    await GET(req("/api/runs"), { params: {} });
    const where = mockDb.wfRun.findMany.mock.calls[0][0]?.where;
    expect(where?.orgId).toBe("org_A");
    expect(where?.workflow).toEqual({
      OR: [{ scope: "org" }, { scope: "personal", ownerId: "u1" }],
    });
  });

  it("maps runs on the happy path", async () => {
    setSession(USER);
    mockDb.wfRun.findMany.mockResolvedValue([
      {
        id: "run1",
        workflowId: "wf1",
        status: "success",
        startedAt: new Date("2026-07-14T09:14:00Z"),
        finishedAt: new Date("2026-07-14T09:14:01Z"),
        durationMs: 1200,
        error: null,
        workflow: { name: "Alert on slipping KPI" },
      } as never,
    ]);
    const res = await GET(req("/api/runs"), { params: {} });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data[0].workflowName).toBe("Alert on slipping KPI");
    expect(body.data[0].durationMs).toBe(1200);
  });
});
