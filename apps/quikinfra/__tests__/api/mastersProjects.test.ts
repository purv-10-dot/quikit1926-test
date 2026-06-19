import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/masters/projects/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/masters/projects${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/masters/projects", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const VALID = { code: "PRJ-01", name: "Highway", clientId: "client-1" };

beforeEach(() => {
  resetMockDb();
  setContext(null);
});

// ═══════════════════════════════════════════════
// GET /api/masters/projects
// ═══════════════════════════════════════════════

describe("GET /api/masters/projects — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildGET());
    expect(res.status).toBe(401);
  });

  it("allows ANY authenticated org user (view is ungated)", async () => {
    setContext(makeUserCtx([]));
    db.cnProject.findMany.mockResolvedValue([]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
  });
});

describe("GET /api/masters/projects — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns the legacy {data,total} shape when unpaginated", async () => {
    db.cnProject.findMany.mockResolvedValue([
      { id: "p1", orgId: TEST_TENANT, code: "PRJ-01", name: "Highway", status: "active" },
      { id: "p2", orgId: TEST_TENANT, code: "PRJ-02", name: "Bridge", status: "active" },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.data[0].code).toBe("PRJ-01");
  });

  it("scopes the query to the caller's org", async () => {
    db.cnProject.findMany.mockResolvedValue([]);
    await GET(buildGET());
    const where = db.cnProject.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe(TEST_TENANT);
  });

  it("pushes take/skip + count down when paginated", async () => {
    db.cnProject.findMany.mockResolvedValue([]);
    db.cnProject.count.mockResolvedValue(0);
    const res = await GET(buildGET("page=2&pageSize=10"));
    const body = await res.json();
    expect(db.cnProject.findMany.mock.calls[0][0].take).toBe(10);
    expect(db.cnProject.findMany.mock.calls[0][0].skip).toBe(10);
    expect(body.page).toBe(2);
  });
});

// ═══════════════════════════════════════════════
// POST /api/masters/projects
// ═══════════════════════════════════════════════

describe("POST /api/masters/projects — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST(VALID));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks construction.masters.create", async () => {
    setContext(makeUserCtx([]));
    const res = await POST(buildPOST(VALID));
    expect(res.status).toBe(403);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx(["construction.masters.create"], {
        permissionMatrix: { "master.project": { add: false } },
      }),
    );
    const res = await POST(buildPOST(VALID));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/masters/projects — validation", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns 400 on an invalid project code", async () => {
    const res = await POST(buildPOST({ ...VALID, code: "X" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/code/i);
  });

  it("returns 400 when name is missing", async () => {
    const res = await POST(buildPOST({ code: "PRJ-01", clientId: "client-1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/required/i);
  });

  it("returns 400 when clientId is missing", async () => {
    const res = await POST(buildPOST({ code: "PRJ-01", name: "Highway" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/client/i);
  });
});

describe("POST /api/masters/projects — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("creates a project scoped to the org and returns 201", async () => {
    db.cnProject.create.mockResolvedValue({
      id: "p1",
      orgId: TEST_TENANT,
      code: "PRJ-01",
      name: "Highway",
      status: "active",
      createdBy: TEST_USER,
      updatedBy: TEST_USER,
    });

    const res = await POST(buildPOST(VALID));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("p1");

    const data = db.cnProject.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
    expect(data.name).toBe("Highway");
  });

  it("maps a Prisma P2002 unique violation to 409", async () => {
    db.cnProject.create.mockRejectedValue({ code: "P2002" });
    const res = await POST(buildPOST(VALID));
    expect(res.status).toBe(409);
  });
});
