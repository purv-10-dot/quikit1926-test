import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/projects/[projectId]/estimations/route";

const db = mockDb as any;
const PROJECT = "proj-1";
const params = { params: { projectId: PROJECT } };

function buildGET(): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}/estimations`, { method: "GET" });
}
function buildPOST(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}/estimations`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  db.$queryRaw.mockResolvedValue([]);
  db.$executeRaw.mockResolvedValue(1);
});

// ═══════════════════════════════════════════════
// GET /api/projects/[projectId]/estimations  (gate: construction.estimation.view)
// ═══════════════════════════════════════════════

describe("GET /api/projects/[projectId]/estimations", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(buildGET(), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.estimation.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(buildGET(), params)).status).toBe(403);
  });

  it("returns the project's estimations", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([
      { id: "est1", orgId: TEST_TENANT, projectId: PROJECT, boqItemId: "B1", boqNo: "1.1", status: "draft", materials: [] },
    ]);
    const res = await GET(buildGET(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
  });
});

// ═══════════════════════════════════════════════
// POST /api/projects/[projectId]/estimations  (gate: construction.estimation.create + matrix pm.estimation:add)
// ═══════════════════════════════════════════════

describe("POST /api/projects/[projectId]/estimations", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(buildPOST({}), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.estimation.create", async () => {
    setContext(makeUserCtx([]));
    expect((await POST(buildPOST({}), params)).status).toBe(403);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx(["construction.estimation.create"], {
        permissionMatrix: { "pm.estimation": { add: false } },
      }),
    );
    expect((await POST(buildPOST({}), params)).status).toBe(403);
  });

  it("returns 404 when the project does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue(null);
    const res = await POST(buildPOST({ boqItemId: "B1", boqNo: "1.1", materials: [{ itemId: "i1" }] }), params);
    expect(res.status).toBe(404);
  });

  it("returns 400 when boqItemId / boqNo are missing", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue({ id: PROJECT, name: "Site" });
    const res = await POST(buildPOST({ materials: [{ itemId: "i1" }] }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/boqItemId and boqNo are required/i);
  });

  it("returns 400 when no material lines are supplied", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue({ id: PROJECT, name: "Site" });
    const res = await POST(buildPOST({ boqItemId: "B1", boqNo: "1.1", materials: [] }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/at least one material/i);
  });

  it("creates an estimation scoped to the project and returns 201", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue({ id: PROJECT, name: "Site" });
    db.$executeRaw.mockResolvedValue(1); // INSERT
    db.$queryRaw.mockResolvedValue([
      { id: "est1", orgId: TEST_TENANT, projectId: PROJECT, boqItemId: "B1", boqNo: "1.1", status: "draft", materials: [{ itemId: "i1" }] },
    ]); // findEstimationById after insert
    const res = await POST(
      buildPOST({ boqItemId: "B1", boqNo: "1.1", materials: [{ itemId: "i1", qtyPerUnit: 1, wastePercent: 0, standardRate: 10 }] }),
      params,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("est1");
    expect(db.$executeRaw).toHaveBeenCalled();
  });
});
