import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET, PUT } from "@/app/api/view-prefs/route";

const USER = "user_1";
const TENANT = "tenant_1";
const PROJECT = "proj_1";
const VIEW_KEY = "backlog-view";

const SETTINGS = {
  epicPanel: false,
  emptySprints: true,
  density: "compact" as const,
  fields: { workType: true, key: true, epic: false, status: true, assignee: false },
};

function getReq(qs = "") {
  return new NextRequest(`http://localhost/api/view-prefs${qs}`, { method: "GET" });
}
function putReq(body: unknown) {
  return new NextRequest("http://localhost/api/view-prefs", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

describe("GET /api/view-prefs", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(getReq(`?viewKey=${VIEW_KEY}`), { params: {} } as never);
    expect(res.status).toBe(401);
  });

  it("returns 400 when viewKey is missing", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    const res = await GET(getReq(), { params: {} } as never);
    expect(res.status).toBe(400);
  });

  it("scopes the lookup by orgId + userId (tenant isolation)", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtUserViewPref.findFirst.mockResolvedValue(null);
    const res = await GET(
      getReq(`?viewKey=${VIEW_KEY}&projectId=${PROJECT}`),
      { params: {} } as never,
    );
    expect(res.status).toBe(200);
    expect(mockDb.qtUserViewPref.findFirst).toHaveBeenCalledWith({
      where: { orgId: TENANT, userId: USER, viewKey: VIEW_KEY, projectId: PROJECT },
    });
    const body = await res.json();
    expect(body.data).toEqual({ hiddenColumns: [], columnOrder: [], settings: null });
  });

  it("returns the stored settings blob when a row exists", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtUserViewPref.findFirst.mockResolvedValue({
      id: "p1",
      orgId: TENANT,
      userId: USER,
      projectId: PROJECT,
      viewKey: VIEW_KEY,
      hiddenColumns: [],
      columnOrder: [],
      settings: SETTINGS,
    } as never);
    const res = await GET(
      getReq(`?viewKey=${VIEW_KEY}&projectId=${PROJECT}`),
      { params: {} } as never,
    );
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.settings).toEqual(SETTINGS);
  });
});

describe("PUT /api/view-prefs", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await PUT(
      putReq({ viewKey: VIEW_KEY, projectId: PROJECT, settings: SETTINGS }),
      { params: {} } as never,
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on an invalid density value", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    const res = await PUT(
      putReq({
        viewKey: VIEW_KEY,
        projectId: PROJECT,
        settings: { density: "cozy" },
      }),
      { params: {} } as never,
    );
    expect(res.status).toBe(400);
  });

  it("creates a settings row scoped to org + user when none exists", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtUserViewPref.findFirst.mockResolvedValue(null);
    mockDb.qtUserViewPref.create.mockResolvedValue({ id: "new" } as never);

    const res = await PUT(
      putReq({ viewKey: VIEW_KEY, projectId: PROJECT, settings: SETTINGS }),
      { params: {} } as never,
    );
    expect(res.status).toBe(200);
    expect(mockDb.qtUserViewPref.create).toHaveBeenCalledWith({
      data: {
        orgId: TENANT,
        userId: USER,
        viewKey: VIEW_KEY,
        projectId: PROJECT,
        hiddenColumns: [],
        columnOrder: [],
        settings: SETTINGS,
      },
    });
  });

  it("updates only the settings field (leaves column prefs untouched)", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtUserViewPref.findFirst.mockResolvedValue({ id: "p1" } as never);
    mockDb.qtUserViewPref.update.mockResolvedValue({ id: "p1" } as never);

    const res = await PUT(
      putReq({ viewKey: VIEW_KEY, projectId: PROJECT, settings: SETTINGS }),
      { params: {} } as never,
    );
    expect(res.status).toBe(200);
    expect(mockDb.qtUserViewPref.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { settings: SETTINGS },
    });
  });
});
