import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/projects/dpr/route";
import { GET as WEATHER } from "@/app/api/projects/dpr/weather/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/projects/dpr${qs ? "?" + qs : ""}`,
    { method: "GET" },
  );
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/projects/dpr", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function weatherGET(qs = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/projects/dpr/weather${qs ? "?" + qs : ""}`,
    { method: "GET" },
  );
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  // Read-enrichment defaults — repos batch-fetch BOQ items / instances and .map.
  db.cnDailyProgressReport.findMany.mockResolvedValue([]);
  db.cnBOQItemV2.findMany.mockResolvedValue([]);
  db.cnApprovalInstance.findMany.mockResolvedValue([]);
  db.cnProject.findMany.mockResolvedValue([]);
  db.user.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/projects/dpr  (gate: construction.dpr.view)
// ═══════════════════════════════════════════════

describe("GET /api/projects/dpr", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(buildGET())).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.dpr.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(buildGET())).status).toBe(403);
  });

  it("returns the {data,total} shape scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnDailyProgressReport.findMany.mockResolvedValue([
      {
        id: "d1",
        orgId: TEST_TENANT,
        dprNumber: "DPR-SITE-20260601-001",
        projectId: "proj1",
        status: "draft",
        workItems: [],
        labourEntries: [],
        machineryEntries: [],
        materialEntries: [],
      },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.data[0].dprNumber).toBe("DPR-SITE-20260601-001");
    expect(db.cnDailyProgressReport.findMany.mock.calls[0][0].where.orgId).toBe(
      TEST_TENANT,
    );
  });

  it("filters out soft-deleted rows by default", async () => {
    setContext(makeAdminCtx());
    await GET(buildGET());
    const where = db.cnDailyProgressReport.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ not: "inactive" });
  });

  it("pushes a status filter down when provided", async () => {
    setContext(makeAdminCtx());
    await GET(buildGET("status=submitted"));
    const where = db.cnDailyProgressReport.findMany.mock.calls[0][0].where;
    expect(where.status).toBe("submitted");
  });
});

// ═══════════════════════════════════════════════
// POST /api/projects/dpr  (gate: construction.dpr.create + matrix pm.dpr:add)
// ═══════════════════════════════════════════════

describe("POST /api/projects/dpr — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(buildPOST({ projectId: "proj1" }))).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.dpr.create", async () => {
    setContext(makeUserCtx([]));
    expect((await POST(buildPOST({ projectId: "proj1" }))).status).toBe(403);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx(["construction.dpr.create"], {
        permissionMatrix: { "pm.dpr": { add: false } },
      }),
    );
    expect((await POST(buildPOST({ projectId: "proj1" }))).status).toBe(403);
  });
});

describe("POST /api/projects/dpr — validation", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns 400 when projectId is missing", async () => {
    const res = await POST(buildPOST({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/projectId is required/i);
  });

  it("returns 404 when the project does not exist in this org", async () => {
    db.cnProject.findFirst.mockResolvedValue(null);
    const res = await POST(buildPOST({ projectId: "ghost" }));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/projects/dpr — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("creates a draft DPR scoped to the org and returns 201", async () => {
    db.cnProject.findFirst.mockResolvedValue({
      id: "proj1",
      orgId: TEST_TENANT,
      name: "Bridge",
      code: "BRG",
    });
    db.cnDailyProgressReport.count.mockResolvedValue(0);
    db.cnDailyProgressReport.create.mockResolvedValue({
      id: "d1",
      orgId: TEST_TENANT,
      dprNumber: "DPR-BRG-20260601-001",
      projectId: "proj1",
      status: "draft",
      project: { id: "proj1", name: "Bridge", code: "BRG" },
      workItems: [],
      labourEntries: [],
      machineryEntries: [],
      materialEntries: [],
      staffEntries: [],
      createdBy: TEST_USER,
      updatedBy: TEST_USER,
    });

    const res = await POST(buildPOST({ projectId: "proj1", reportDate: "2026-06-01" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("d1");
    expect(body.status).toBe("draft");
    const data = db.cnDailyProgressReport.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.projectId).toBe("proj1");
  });

  it("maps a Prisma P2002 unique violation to 409", async () => {
    db.cnProject.findFirst.mockResolvedValue({
      id: "proj1",
      orgId: TEST_TENANT,
      name: "Bridge",
      code: "BRG",
    });
    db.cnDailyProgressReport.count.mockResolvedValue(0);
    db.cnDailyProgressReport.create.mockRejectedValue({ code: "P2002" });
    const res = await POST(buildPOST({ projectId: "proj1" }));
    expect(res.status).toBe(409);
  });
});

// ═══════════════════════════════════════════════
// GET /api/projects/dpr/weather  (gate: dpr.read | dpr.write)
// ═══════════════════════════════════════════════

describe("GET /api/projects/dpr/weather", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await WEATHER(weatherGET("projectId=proj1&reportDate=2026-06-01"))).status).toBe(
      401,
    );
  });

  it("returns 403 when the user holds neither dpr.read nor dpr.write", async () => {
    setContext(makeUserCtx([]));
    expect(
      (await WEATHER(weatherGET("projectId=proj1&reportDate=2026-06-01"))).status,
    ).toBe(403);
  });

  it("returns 503 when WEATHER_API_KEY is not configured", async () => {
    const prev = process.env.WEATHER_API_KEY;
    delete process.env.WEATHER_API_KEY;
    setContext(makeUserCtx(["dpr.read"]));
    const res = await WEATHER(weatherGET("projectId=proj1&reportDate=2026-06-01"));
    expect(res.status).toBe(503);
    if (prev !== undefined) process.env.WEATHER_API_KEY = prev;
  });

  it("returns 400 when projectId is missing (key configured)", async () => {
    const prev = process.env.WEATHER_API_KEY;
    process.env.WEATHER_API_KEY = "test-key";
    setContext(makeUserCtx(["dpr.write"]));
    const res = await WEATHER(weatherGET("reportDate=2026-06-01"));
    expect(res.status).toBe(400);
    if (prev === undefined) delete process.env.WEATHER_API_KEY;
    else process.env.WEATHER_API_KEY = prev;
  });
});
