import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET as LIST_GET, POST as LIST_POST } from "@/app/api/reports/views/route";
import {
  GET as ITEM_GET,
  PATCH as ITEM_PATCH,
  DELETE as ITEM_DELETE,
} from "@/app/api/reports/views/[id]/route";

const USER = "user_1";
const ORG = "org_1";

function getReq(path = "/api/reports/views") {
  return new NextRequest(`http://localhost${path}`, { method: "GET" });
}
function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/reports/views", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}
function patchReq(id: string, body: unknown) {
  return new NextRequest(`http://localhost/api/reports/views/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}
function delReq(id: string) {
  return new NextRequest(`http://localhost/api/reports/views/${id}`, { method: "DELETE" });
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

describe("GET /api/reports/views", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await LIST_GET(getReq(), { params: {} } as never);
    expect(res.status).toBe(401);
  });

  it("scopes findMany to the caller's userId and orgId", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    mockDb.qtReportView.findMany.mockResolvedValue([]);

    await LIST_GET(getReq(), { params: {} } as never);

    const call = mockDb.qtReportView.findMany.mock.calls[0]?.[0] as {
      where: { orgId: string; userId: string; kind: string };
    };
    expect(call.where.orgId).toBe(ORG);
    expect(call.where.userId).toBe(USER);
    expect(call.where.kind).toBe("executive");
  });
});

describe("POST /api/reports/views", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await LIST_POST(
      postReq({ name: "X", filtersJson: {} }),
      { params: {} } as never,
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on missing name", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    const res = await LIST_POST(postReq({ filtersJson: {} }), { params: {} } as never);
    expect(res.status).toBe(400);
  });

  it("stamps orgId + userId on create", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    mockDb.qtReportView.count.mockResolvedValue(0);
    mockDb.qtReportView.create.mockResolvedValue({
      id: "v1",
      name: "Test",
      filtersJson: {},
      isPinned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const res = await LIST_POST(
      postReq({ name: "Test", filtersJson: { weeksBack: 12 } }),
      { params: {} } as never,
    );
    expect(res.status).toBe(201);

    const createArg = mockDb.qtReportView.create.mock.calls[0]?.[0] as {
      data: { orgId: string; userId: string; name: string; kind: string };
    };
    expect(createArg.data.orgId).toBe(ORG);
    expect(createArg.data.userId).toBe(USER);
    expect(createArg.data.kind).toBe("executive");
  });

  it("returns 400 when at quota cap (25 views)", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    mockDb.qtReportView.count.mockResolvedValue(25);

    const res = await LIST_POST(
      postReq({ name: "Test", filtersJson: {} }),
      { params: {} } as never,
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/reports/views/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await ITEM_GET(getReq("/api/reports/views/abc"), {
      params: { id: "abc" },
    } as never);
    expect(res.status).toBe(401);
  });

  it("returns 404 for another user's view (tenant isolation)", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    mockDb.qtReportView.findFirst.mockResolvedValue(null);

    const res = await ITEM_GET(getReq("/api/reports/views/other"), {
      params: { id: "other" },
    } as never);
    expect(res.status).toBe(404);

    const findCall = mockDb.qtReportView.findFirst.mock.calls[0]?.[0] as {
      where: { id: string; orgId: string; userId: string };
    };
    expect(findCall.where.userId).toBe(USER);
    expect(findCall.where.orgId).toBe(ORG);
  });
});

describe("PATCH /api/reports/views/[id]", () => {
  it("returns 404 when target view is not owned by caller", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    mockDb.qtReportView.findFirst.mockResolvedValue(null);

    const res = await ITEM_PATCH(patchReq("other", { isPinned: true }), {
      params: { id: "other" },
    } as never);
    expect(res.status).toBe(404);
    expect(mockDb.qtReportView.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/reports/views/[id]", () => {
  it("returns 404 when not owned by caller", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    mockDb.qtReportView.findFirst.mockResolvedValue(null);

    const res = await ITEM_DELETE(delReq("other"), {
      params: { id: "other" },
    } as never);
    expect(res.status).toBe(404);
    expect(mockDb.qtReportView.delete).not.toHaveBeenCalled();
  });

  it("deletes when caller owns the view", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    mockDb.qtReportView.findFirst.mockResolvedValue({ id: "v1" } as never);
    mockDb.qtReportView.delete.mockResolvedValue({ id: "v1" } as never);

    const res = await ITEM_DELETE(delReq("v1"), {
      params: { id: "v1" },
    } as never);
    expect(res.status).toBe(200);
    expect(mockDb.qtReportView.delete).toHaveBeenCalledWith({ where: { id: "v1" } });
  });
});
