import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/masters/gst/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/masters/gst${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/masters/gst", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const validBody = { code: "9954", description: "Construction services", igstRate: 18 };

beforeEach(() => {
  resetMockDb();
  setContext(null);
});

// ═══════════════════════════════════════════════
// GET /api/masters/gst
// ═══════════════════════════════════════════════

describe("GET /api/masters/gst — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildGET());
    expect(res.status).toBe(401);
  });

  it("allows ANY authenticated org user (view is ungated)", async () => {
    setContext(makeUserCtx([]));
    db.cnGSTCode.findMany.mockResolvedValue([]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
  });
});

describe("GET /api/masters/gst — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns the {data,total} shape when unpaginated", async () => {
    db.cnGSTCode.findMany.mockResolvedValue([
      { id: "g1", orgId: TEST_TENANT, code: "9954", description: "X", igstRate: "18", status: "active" },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it("scopes the query to the caller's org", async () => {
    db.cnGSTCode.findMany.mockResolvedValue([]);
    await GET(buildGET());
    const where = db.cnGSTCode.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe(TEST_TENANT);
  });

  it("pushes take/skip + count down when paginated", async () => {
    db.cnGSTCode.findMany.mockResolvedValue([]);
    db.cnGSTCode.count.mockResolvedValue(0);
    const res = await GET(buildGET("page=2&pageSize=10"));
    const body = await res.json();
    expect(db.cnGSTCode.findMany.mock.calls[0][0].take).toBe(10);
    expect(db.cnGSTCode.findMany.mock.calls[0][0].skip).toBe(10);
    expect(body.page).toBe(2);
  });
});

// ═══════════════════════════════════════════════
// POST /api/masters/gst
// ═══════════════════════════════════════════════

describe("POST /api/masters/gst — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks construction.masters.create", async () => {
    setContext(makeUserCtx([]));
    const res = await POST(buildPOST(validBody));
    expect(res.status).toBe(403);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx(["construction.masters.create"], {
        permissionMatrix: { "org.gst": { add: false } },
      }),
    );
    const res = await POST(buildPOST(validBody));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/masters/gst — validation", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns 400 when code is missing", async () => {
    const res = await POST(buildPOST({ description: "X", igstRate: 18 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/code/i);
  });

  it("returns 400 when description is missing", async () => {
    const res = await POST(buildPOST({ code: "9954", igstRate: 18 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when igstRate is missing", async () => {
    const res = await POST(buildPOST({ code: "9954", description: "X" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/masters/gst — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("creates a GST code scoped to the org and returns 201", async () => {
    db.cnGSTCode.create.mockResolvedValue({
      id: "g1",
      orgId: TEST_TENANT,
      code: "9954",
      description: "X",
      igstRate: "18",
      status: "active",
      createdBy: TEST_USER,
      updatedBy: TEST_USER,
    });

    const res = await POST(buildPOST(validBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("g1");

    const data = db.cnGSTCode.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
    expect(data.code).toBe("9954");
  });

  it("maps a Prisma P2002 unique violation to 409", async () => {
    db.cnGSTCode.create.mockRejectedValue({ code: "P2002" });
    const res = await POST(buildPOST(validBody));
    expect(res.status).toBe(409);
  });
});
