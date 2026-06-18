import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/masters/machinery/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/masters/machinery${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/masters/machinery", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
});

// ═══════════════════════════════════════════════
// GET /api/masters/machinery
// ═══════════════════════════════════════════════

describe("GET /api/masters/machinery — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildGET());
    expect(res.status).toBe(401);
  });

  it("allows ANY authenticated org user (view is ungated)", async () => {
    setContext(makeUserCtx([]));
    db.cnMachinery.findMany.mockResolvedValue([]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
  });
});

describe("GET /api/masters/machinery — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns the legacy {data,total} shape when unpaginated", async () => {
    db.cnMachinery.findMany.mockResolvedValue([
      { id: "m1", orgId: TEST_TENANT, code: "EXCA-001", name: "Excavator", type: "excavator", status: "active" },
      { id: "m2", orgId: TEST_TENANT, code: "CRAN-001", name: "Crane", type: "crane", status: "active" },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.data[0].code).toBe("EXCA-001");
  });

  it("scopes the query to the caller's org", async () => {
    db.cnMachinery.findMany.mockResolvedValue([]);
    await GET(buildGET());
    const where = db.cnMachinery.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe(TEST_TENANT);
  });

  it("pushes take/skip + count down when paginated", async () => {
    db.cnMachinery.findMany.mockResolvedValue([]);
    db.cnMachinery.count.mockResolvedValue(0);
    const res = await GET(buildGET("page=2&pageSize=10"));
    const body = await res.json();
    expect(db.cnMachinery.findMany.mock.calls[0][0].take).toBe(10);
    expect(db.cnMachinery.findMany.mock.calls[0][0].skip).toBe(10);
    expect(body.page).toBe(2);
  });
});

// ═══════════════════════════════════════════════
// POST /api/masters/machinery
// ═══════════════════════════════════════════════

describe("POST /api/masters/machinery — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST({ name: "Excavator", type: "excavator" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks construction.masters.create", async () => {
    setContext(makeUserCtx([]));
    const res = await POST(buildPOST({ name: "Excavator", type: "excavator" }));
    expect(res.status).toBe(403);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx(["construction.masters.create"], {
        permissionMatrix: { "master.machinery": { add: false } },
      }),
    );
    const res = await POST(buildPOST({ name: "Excavator", type: "excavator" }));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/masters/machinery — validation", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns 400 when name is missing", async () => {
    const res = await POST(buildPOST({ type: "excavator" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/required/i);
  });

  it("returns 400 when type is missing", async () => {
    const res = await POST(buildPOST({ name: "Excavator" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/required/i);
  });
});

describe("POST /api/masters/machinery — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("creates machinery scoped to the org and returns 201", async () => {
    db.cnMachinery.count.mockResolvedValue(0);
    db.cnMachinery.create.mockResolvedValue({
      id: "m1",
      orgId: TEST_TENANT,
      code: "EXCA-001",
      name: "Excavator",
      type: "excavator",
      status: "active",
      createdBy: TEST_USER,
      updatedBy: TEST_USER,
    });

    const res = await POST(buildPOST({ name: "Excavator", type: "excavator" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("m1");

    const data = db.cnMachinery.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
    expect(data.name).toBe("Excavator");
  });

  it("maps a Prisma P2002 unique violation to 409", async () => {
    db.cnMachinery.count.mockResolvedValue(0);
    db.cnMachinery.create.mockRejectedValue({ code: "P2002" });
    const res = await POST(buildPOST({ name: "Dup", type: "excavator" }));
    expect(res.status).toBe(409);
  });
});
