import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/quality/checklists/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/quality/checklists${qs ? "?" + qs : ""}`,
    { method: "GET" },
  );
}
function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/quality/checklists", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  db.cnSafetyChecklist.findMany.mockResolvedValue([]);
  db.cnSafetyChecklist.count.mockResolvedValue(0);
});

// ═══════════════════════════════════════════════
// GET /api/quality/checklists
// ═══════════════════════════════════════════════

describe("GET /api/quality/checklists", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(buildGET())).status).toBe(401);
  });

  it("lists checklists (view ungated) scoped to the org", async () => {
    setContext(makeUserCtx([])); // no perms — view is ungated
    db.cnSafetyChecklist.findMany.mockResolvedValue([
      {
        id: "ck1",
        orgId: TEST_TENANT,
        templateName: "Concrete Pour",
        checklistDate: new Date("2026-01-02"),
        overallStatus: "pass",
        items: [{ item: "rebar" }],
      },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("Concrete Pour");
    expect(db.cnSafetyChecklist.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });

  it("pushes take/skip + count when paginated", async () => {
    setContext(makeAdminCtx());
    const res = await GET(buildGET("page=2&pageSize=10"));
    const body = await res.json();
    expect(db.cnSafetyChecklist.findMany.mock.calls[0][0].take).toBe(10);
    expect(db.cnSafetyChecklist.findMany.mock.calls[0][0].skip).toBe(10);
    expect(body.page).toBe(2);
  });
});

// ═══════════════════════════════════════════════
// POST /api/quality/checklists
// ═══════════════════════════════════════════════

describe("POST /api/quality/checklists — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(buildPOST({ name: "X" }))).status).toBe(401);
  });

  it("returns 403 when the matrix denies add on quality.home", async () => {
    setContext(
      makeUserCtx([], { permissionMatrix: { "quality.home": { add: false } } }),
    );
    expect((await POST(buildPOST({ name: "X" }))).status).toBe(403);
  });
});

describe("POST /api/quality/checklists — validation", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns 400 when name is missing", async () => {
    const res = await POST(buildPOST({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/required/i);
  });

  it("returns 400 on an invalid date", async () => {
    const res = await POST(buildPOST({ name: "X", date: "not-a-date" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/quality/checklists — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("creates a checklist scoped to the org and returns 201", async () => {
    db.cnSafetyChecklist.create.mockResolvedValue({
      id: "ck1",
      orgId: TEST_TENANT,
      templateName: "Pour",
      checklistDate: new Date("2026-01-02"),
      overallStatus: "pass",
      items: [{ item: "a" }, { item: "b" }],
    });
    const res = await POST(buildPOST({ name: "Pour", items: "a, b" }));
    expect(res.status).toBe(201);
    const data = db.cnSafetyChecklist.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
    expect(data.templateName).toBe("Pour");
    expect(data.items).toEqual([{ item: "a" }, { item: "b" }]);
  });
});
