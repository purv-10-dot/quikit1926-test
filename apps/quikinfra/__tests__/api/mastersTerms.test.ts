import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/masters/terms/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/masters/terms${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/masters/terms", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const validBody = {
  title: "Payment Terms",
  body: "Net 30 days from invoice date.",
  applicableTo: "PO",
};

beforeEach(() => {
  resetMockDb();
  setContext(null);
});

// ═══════════════════════════════════════════════
// GET /api/masters/terms
// ═══════════════════════════════════════════════

describe("GET /api/masters/terms — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildGET());
    expect(res.status).toBe(401);
  });

  it("allows ANY authenticated org user (view is ungated)", async () => {
    setContext(makeUserCtx([]));
    db.cnTermsCondition.findMany.mockResolvedValue([]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
  });
});

describe("GET /api/masters/terms — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns the {data,total} shape when unpaginated", async () => {
    db.cnTermsCondition.findMany.mockResolvedValue([
      { id: "tc1", orgId: TEST_TENANT, title: "Payment Terms", body: "...", applicableTo: "PO", status: "active" },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it("scopes the query to the caller's org", async () => {
    db.cnTermsCondition.findMany.mockResolvedValue([]);
    await GET(buildGET());
    const where = db.cnTermsCondition.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe(TEST_TENANT);
  });

  it("pushes take/skip + count down when paginated", async () => {
    db.cnTermsCondition.findMany.mockResolvedValue([]);
    db.cnTermsCondition.count.mockResolvedValue(0);
    const res = await GET(buildGET("page=2&pageSize=10"));
    const body = await res.json();
    expect(db.cnTermsCondition.findMany.mock.calls[0][0].take).toBe(10);
    expect(db.cnTermsCondition.findMany.mock.calls[0][0].skip).toBe(10);
    expect(body.page).toBe(2);
  });
});

// ═══════════════════════════════════════════════
// POST /api/masters/terms
// ═══════════════════════════════════════════════

describe("POST /api/masters/terms — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks construction.org_terms.create", async () => {
    setContext(makeUserCtx([]));
    const res = await POST(buildPOST(validBody));
    expect(res.status).toBe(403);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx(["construction.org_terms.create"], {
        permissionMatrix: { "org.terms": { add: false } },
      }),
    );
    const res = await POST(buildPOST(validBody));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/masters/terms — validation", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns 400 when title is missing", async () => {
    const res = await POST(buildPOST({ body: "Net 30 days from invoice.", applicableTo: "PO" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/title/i);
  });

  it("returns 400 when title is too short", async () => {
    const res = await POST(buildPOST({ title: "Hi", body: "Net 30 days from invoice.", applicableTo: "PO" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is too short", async () => {
    const res = await POST(buildPOST({ title: "Payment Terms", body: "short", applicableTo: "PO" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when applicableTo is missing", async () => {
    const res = await POST(buildPOST({ title: "Payment Terms", body: "Net 30 days from invoice." }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/masters/terms — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("creates a T&C template scoped to the org and returns 201", async () => {
    db.cnTermsCondition.create.mockResolvedValue({
      id: "tc1",
      orgId: TEST_TENANT,
      title: "Payment Terms",
      body: "Net 30 days from invoice date.",
      applicableTo: "PO",
      status: "active",
      createdBy: TEST_USER,
      updatedBy: TEST_USER,
    });

    const res = await POST(buildPOST(validBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("tc1");

    const data = db.cnTermsCondition.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
    expect(data.title).toBe("Payment Terms");
  });
});
