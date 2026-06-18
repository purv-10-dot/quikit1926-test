import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/projects/hindrance/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/projects/hindrance${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}
function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/projects/hindrance", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  db.cnHindrance.findMany.mockResolvedValue([]);
  db.cnProject.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/projects/hindrance  (gate: construction.dpr.view)
// ═══════════════════════════════════════════════

describe("GET /api/projects/hindrance", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(buildGET())).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.dpr.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(buildGET())).status).toBe(403);
  });

  it("returns the list scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnHindrance.findMany.mockResolvedValue([
      {
        id: "h1",
        hindranceNo: "HIND-2026-001",
        projectId: "proj1",
        project: { name: "Site" },
        category: "Weather",
        dateFrom: new Date("2026-01-01"),
        dateTo: null,
        daysLost: 2,
        status: "Active",
        description: "Rain",
      },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].hindranceNo).toBe("HIND-2026-001");
    expect(db.cnHindrance.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });
});

// ═══════════════════════════════════════════════
// POST /api/projects/hindrance  (gate: construction.dpr.create + matrix pm.hindrance:add)
// ═══════════════════════════════════════════════

describe("POST /api/projects/hindrance", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(buildPOST({}))).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.dpr.create", async () => {
    setContext(makeUserCtx([]));
    expect((await POST(buildPOST({}))).status).toBe(403);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx(["construction.dpr.create"], {
        permissionMatrix: { "pm.hindrance": { add: false } },
      }),
    );
    expect((await POST(buildPOST({ projectId: "proj1" }))).status).toBe(403);
  });

  it("returns 400 when required fields are missing", async () => {
    setContext(makeAdminCtx());
    const res = await POST(buildPOST({ projectId: "proj1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/required/i);
  });

  it("returns 404 when the project does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue(null);
    const res = await POST(
      buildPOST({ projectId: "proj1", category: "Weather", dateFrom: "2026-01-01", description: "Rain" }),
    );
    expect(res.status).toBe(404);
  });

  it("creates a hindrance scoped to the org and returns 201", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue({ id: "proj1", name: "Site" });
    db.cnHindrance.count.mockResolvedValue(0);
    db.cnHindrance.create.mockResolvedValue({
      id: "h1",
      hindranceNo: "HIND-2026-001",
      projectId: "proj1",
      project: { name: "Site" },
      category: "Weather",
      dateFrom: new Date("2026-01-01"),
      dateTo: null,
      daysLost: 0,
      status: "Active",
      description: "Rain",
    });
    const res = await POST(
      buildPOST({ projectId: "proj1", category: "Weather", dateFrom: "2026-01-01", description: "Rain" }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("h1");
    const data = db.cnHindrance.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
  });
});
