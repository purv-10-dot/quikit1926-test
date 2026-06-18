import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/quality/inspections/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/quality/inspections${qs ? "?" + qs : ""}`,
    { method: "GET" },
  );
}
function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/quality/inspections", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  db.cnQCInspection.findMany.mockResolvedValue([]);
  db.cnQCInspection.count.mockResolvedValue(0);
});

// ═══════════════════════════════════════════════
// GET /api/quality/inspections
// ═══════════════════════════════════════════════

describe("GET /api/quality/inspections", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(buildGET())).status).toBe(401);
  });

  it("lists inspections scoped to the org (view ungated)", async () => {
    setContext(makeUserCtx([]));
    db.cnQCInspection.findMany.mockResolvedValue([
      {
        id: "qi1",
        orgId: TEST_TENANT,
        inspectionNumber: "QI-2026-001",
        inspectorId: TEST_USER,
        inspectionDate: new Date("2026-01-02"),
        decision: "accepted",
        result: "Pass",
        items: [],
      },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].inspectionNo).toBe("QI-2026-001");
    expect(db.cnQCInspection.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });

  it("applies the ?projectId filter", async () => {
    setContext(makeAdminCtx());
    await GET(buildGET("projectId=proj-9"));
    expect(db.cnQCInspection.findMany.mock.calls[0][0].where.projectId).toBe("proj-9");
  });
});

// ═══════════════════════════════════════════════
// POST /api/quality/inspections
// ═══════════════════════════════════════════════

describe("POST /api/quality/inspections — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(buildPOST({ projectId: "p1", date: "2026-01-02" }))).status).toBe(401);
  });

  it("returns 403 when the matrix denies add on quality.home", async () => {
    setContext(
      makeUserCtx([], { permissionMatrix: { "quality.home": { add: false } } }),
    );
    expect((await POST(buildPOST({ projectId: "p1", date: "2026-01-02" }))).status).toBe(403);
  });
});

describe("POST /api/quality/inspections — validation", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns 400 when projectId is missing", async () => {
    const res = await POST(buildPOST({ date: "2026-01-02" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when date is missing", async () => {
    const res = await POST(buildPOST({ projectId: "p1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on an invalid date", async () => {
    const res = await POST(buildPOST({ projectId: "p1", date: "garbage" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/quality/inspections — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("creates an inspection scoped to the org and returns 201", async () => {
    db.cnQCInspection.count.mockResolvedValue(0);
    db.cnQCInspection.create.mockResolvedValue({
      id: "qi1",
      orgId: TEST_TENANT,
      inspectionNumber: "QI-2026-001",
      inspectorId: TEST_USER,
      inspectionDate: new Date("2026-01-02"),
      decision: "accepted",
      result: "Pass",
      projectId: "p1",
      items: [],
    });
    const res = await POST(buildPOST({ projectId: "p1", date: "2026-01-02", result: "Pass" }));
    expect(res.status).toBe(201);
    const data = db.cnQCInspection.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
    expect(data.inspectorId).toBe(TEST_USER);
    expect(data.projectId).toBe("p1");
    expect(data.decision).toBe("accepted");
  });
});
