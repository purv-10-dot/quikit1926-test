import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT } from "../setup";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/estimations/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/estimations${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  db.$queryRaw.mockResolvedValue([]);
  db.cnApprovalInstance.findMany.mockResolvedValue([]);
});

// GET /api/estimations is ungated beyond authentication — the repository
// applies project scoping via ctx.projectIds.

describe("GET /api/estimations", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(buildGET())).status).toBe(401);
  });

  it("allows any authenticated user (project-scoped at the repo layer)", async () => {
    setContext(makeUserCtx([]));
    db.$queryRaw.mockResolvedValue([]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });

  it("returns the rows for the caller's org", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([
      {
        id: "est1",
        orgId: TEST_TENANT,
        projectId: "proj1",
        projectName: "Site",
        boqItemId: "B1",
        boqNo: "1.1",
        status: "draft",
        materials: [],
        approvalId: null,
      },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe("est1");
    expect(body.total).toBe(1);
  });
});
