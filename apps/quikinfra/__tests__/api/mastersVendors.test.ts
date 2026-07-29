import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/masters/vendors/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/masters/vendors${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/masters/vendors", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const VALID = {
  name: "Acme",
  address: "1 Main St",
  email: "acme@example.com",
};

beforeEach(() => {
  resetMockDb();
  setContext(null);
});

// ═══════════════════════════════════════════════
// GET /api/masters/vendors
// ═══════════════════════════════════════════════

describe("GET /api/masters/vendors — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildGET());
    expect(res.status).toBe(401);
  });

  it("allows ANY authenticated org user (view is ungated)", async () => {
    setContext(makeUserCtx([]));
    db.cnVendor.findMany.mockResolvedValue([]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
  });
});

describe("GET /api/masters/vendors — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns the legacy {data,total} shape when unpaginated", async () => {
    db.cnVendor.findMany.mockResolvedValue([
      { id: "v1", orgId: TEST_TENANT, code: "VND-001", name: "Acme", status: "active" },
      { id: "v2", orgId: TEST_TENANT, code: "VND-002", name: "Bolt", status: "active" },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.data[0].code).toBe("VND-001");
  });

  it("scopes the query to the caller's org", async () => {
    db.cnVendor.findMany.mockResolvedValue([]);
    await GET(buildGET());
    const where = db.cnVendor.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe(TEST_TENANT);
  });

  it("excludes deleted rows so they leave the UI entirely", async () => {
    db.cnVendor.findMany.mockResolvedValue([]);
    await GET(buildGET());
    const where = db.cnVendor.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ not: "deleted" });
  });

  it("pushes take/skip + count down when paginated", async () => {
    db.cnVendor.findMany.mockResolvedValue([]);
    db.cnVendor.count.mockResolvedValue(0);
    const res = await GET(buildGET("page=2&pageSize=10"));
    const body = await res.json();
    expect(db.cnVendor.findMany.mock.calls[0][0].take).toBe(10);
    expect(db.cnVendor.findMany.mock.calls[0][0].skip).toBe(10);
    expect(body.page).toBe(2);
  });
});

// ═══════════════════════════════════════════════
// POST /api/masters/vendors
// ═══════════════════════════════════════════════

describe("POST /api/masters/vendors — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST(VALID));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks construction.master_vendor.create", async () => {
    setContext(makeUserCtx([]));
    const res = await POST(buildPOST(VALID));
    expect(res.status).toBe(403);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx(["construction.master_vendor.create"], {
        permissionMatrix: { "master.vendor": { add: false } },
      }),
    );
    const res = await POST(buildPOST(VALID));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/masters/vendors — validation", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns 400 when name is missing", async () => {
    const res = await POST(buildPOST({ address: "x", email: "a@b.io" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/required/i);
  });

  it("returns 400 when address is missing", async () => {
    const res = await POST(buildPOST({ name: "Acme", email: "a@b.io" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when email is missing", async () => {
    const res = await POST(buildPOST({ name: "Acme", address: "x" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on an invalid email", async () => {
    const res = await POST(buildPOST({ name: "Acme", address: "x", email: "nope" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on an invalid mobile", async () => {
    const res = await POST(buildPOST({ ...VALID, phone: "123" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on an invalid GSTIN", async () => {
    const res = await POST(buildPOST({ ...VALID, gstin: "BADGSTIN" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/masters/vendors — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("creates a vendor scoped to the org and returns 201", async () => {
    db.cnVendor.count.mockResolvedValue(0);
    db.cnVendor.create.mockResolvedValue({
      id: "v1",
      orgId: TEST_TENANT,
      code: "VND-001",
      name: "Acme",
      status: "active",
      createdBy: TEST_USER,
      updatedBy: TEST_USER,
    });

    const res = await POST(buildPOST({ ...VALID, phone: "9876543210" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("v1");

    const data = db.cnVendor.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
    expect(data.name).toBe("Acme");
    expect(data.phone).toBe("9876543210");
  });

  it("maps a Prisma P2002 unique violation to 409", async () => {
    db.cnVendor.count.mockResolvedValue(0);
    db.cnVendor.create.mockRejectedValue({ code: "P2002" });
    const res = await POST(buildPOST(VALID));
    expect(res.status).toBe(409);
  });
});
