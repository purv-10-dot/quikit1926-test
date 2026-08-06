import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/masters/tds/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/masters/tds${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/masters/tds", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const validBody = { section: "194C", description: "Contractor payments", rate: 2 };

beforeEach(() => {
  resetMockDb();
  setContext(null);
});

// ═══════════════════════════════════════════════
// GET /api/masters/tds
// ═══════════════════════════════════════════════

describe("GET /api/masters/tds — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildGET());
    expect(res.status).toBe(401);
  });

  it("allows ANY authenticated org user (view is ungated)", async () => {
    setContext(makeUserCtx([]));
    db.cnTDSCode.findMany.mockResolvedValue([]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
  });
});

describe("GET /api/masters/tds — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns the {data,total} shape when unpaginated", async () => {
    db.cnTDSCode.findMany.mockResolvedValue([
      { id: "t1", orgId: TEST_TENANT, section: "194C", description: "X", rate: "2", status: "active" },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it("scopes the query to the caller's org", async () => {
    db.cnTDSCode.findMany.mockResolvedValue([]);
    await GET(buildGET());
    const where = db.cnTDSCode.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe(TEST_TENANT);
  });

  it("pushes take/skip + count down when paginated", async () => {
    db.cnTDSCode.findMany.mockResolvedValue([]);
    db.cnTDSCode.count.mockResolvedValue(0);
    const res = await GET(buildGET("page=2&pageSize=10"));
    const body = await res.json();
    expect(db.cnTDSCode.findMany.mock.calls[0][0].take).toBe(10);
    expect(db.cnTDSCode.findMany.mock.calls[0][0].skip).toBe(10);
    expect(body.page).toBe(2);
  });
});

// ═══════════════════════════════════════════════
// POST /api/masters/tds
// ═══════════════════════════════════════════════

describe("POST /api/masters/tds — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks construction.org_tds.create", async () => {
    setContext(makeUserCtx([]));
    const res = await POST(buildPOST(validBody));
    expect(res.status).toBe(403);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx(["construction.org_tds.create"], {
        permissionMatrix: { "org.tds": { add: false } },
      }),
    );
    const res = await POST(buildPOST(validBody));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/masters/tds — validation", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns 400 when section is missing", async () => {
    const res = await POST(buildPOST({ description: "X", rate: 2 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/section/i);
  });

  it("returns 400 when description is missing", async () => {
    const res = await POST(buildPOST({ section: "194C", rate: 2 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when rate is missing", async () => {
    const res = await POST(buildPOST({ section: "194C", description: "X" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/masters/tds — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("creates a TDS code scoped to the org and returns 201", async () => {
    db.cnTDSCode.create.mockResolvedValue({
      id: "t1",
      orgId: TEST_TENANT,
      section: "194C",
      description: "X",
      rate: "2",
      status: "active",
      createdBy: TEST_USER,
      updatedBy: TEST_USER,
    });

    const res = await POST(buildPOST(validBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("t1");

    const data = db.cnTDSCode.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
    expect(data.section).toBe("194C");
  });
});
