import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/masters/work-categories/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/masters/work-categories${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/masters/work-categories", {
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
// GET /api/masters/work-categories
// ═══════════════════════════════════════════════

describe("GET /api/masters/work-categories — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildGET());
    expect(res.status).toBe(401);
  });

  it("allows ANY authenticated org user (view is ungated)", async () => {
    setContext(makeUserCtx([]));
    db.cnWorkCategory.findMany.mockResolvedValue([]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
  });
});

describe("GET /api/masters/work-categories — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns the legacy {data,total} shape when unpaginated", async () => {
    db.cnWorkCategory.findMany.mockResolvedValue([
      { id: "w1", orgId: TEST_TENANT, name: "Civil", status: "active" },
      { id: "w2", orgId: TEST_TENANT, name: "Electrical", status: "active" },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.data[0].name).toBe("Civil");
  });

  it("scopes the query to the caller's org", async () => {
    db.cnWorkCategory.findMany.mockResolvedValue([]);
    await GET(buildGET());
    const where = db.cnWorkCategory.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe(TEST_TENANT);
  });

  it("applies a search filter across name/description", async () => {
    db.cnWorkCategory.findMany.mockResolvedValue([]);
    await GET(buildGET("search=Civil"));
    const where = db.cnWorkCategory.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeDefined();
    expect(where.OR.some((c: any) => c.name?.contains === "Civil")).toBe(true);
  });

  it("pushes take/skip + count down when paginated", async () => {
    db.cnWorkCategory.findMany.mockResolvedValue([]);
    db.cnWorkCategory.count.mockResolvedValue(0);
    const res = await GET(buildGET("page=2&pageSize=10"));
    const body = await res.json();
    expect(db.cnWorkCategory.findMany.mock.calls[0][0].take).toBe(10);
    expect(db.cnWorkCategory.findMany.mock.calls[0][0].skip).toBe(10);
    expect(body.page).toBe(2);
  });
});

// ═══════════════════════════════════════════════
// POST /api/masters/work-categories
// ═══════════════════════════════════════════════

describe("POST /api/masters/work-categories — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST({ name: "Civil" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks construction.org_work_category.create", async () => {
    setContext(makeUserCtx([]));
    const res = await POST(buildPOST({ name: "Civil" }));
    expect(res.status).toBe(403);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx(["construction.org_work_category.create"], {
        permissionMatrix: { "org.work_category": { add: false } },
      }),
    );
    const res = await POST(buildPOST({ name: "Civil" }));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/masters/work-categories — validation", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns 400 when name is missing", async () => {
    const res = await POST(buildPOST({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/name is required/i);
  });
});

describe("POST /api/masters/work-categories — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("creates a work category scoped to the org and returns 201", async () => {
    db.cnWorkCategory.create.mockResolvedValue({
      id: "w1",
      orgId: TEST_TENANT,
      name: "Civil",
      status: "active",
      createdBy: TEST_USER,
      updatedBy: TEST_USER,
    });

    const res = await POST(buildPOST({ name: "Civil" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("w1");

    const data = db.cnWorkCategory.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
    expect(data.name).toBe("Civil");
  });
});
