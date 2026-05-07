import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET, POST } from "@/app/api/activity/route";

const USER = "user_1";
const OTHER_USER = "user_2";
const TENANT = "tenant_1";
const PROJECT = "proj_1";

function getReq(qs = "") {
  return new NextRequest(`http://localhost/api/activity${qs}`, { method: "GET" });
}
function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/activity", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

describe("GET /api/activity — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(getReq(), { params: {} } as never);
    expect(res.status).toBe(401);
  });

  it("returns empty list when user has no visible projects", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProjectMember.findMany.mockResolvedValue([]);
    const res = await GET(getReq(), { params: {} } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(mockDb.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("GET /api/activity — happy path", () => {
  beforeEach(() => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProjectMember.findMany.mockResolvedValue([
      { projectId: PROJECT } as never,
    ]);
  });

  it("queries via raw SQL when there are visible projects", async () => {
    mockDb.$queryRaw.mockResolvedValue([] as never);
    const res = await GET(getReq(), { params: {} } as never);
    expect(res.status).toBe(200);
    expect(mockDb.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/activity", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(
      postReq({ projectId: PROJECT, kind: "project", title: "x", href: "/x" }),
      { params: {} } as never,
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid payload", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    const res = await POST(postReq({ projectId: "" }), { params: {} } as never);
    expect(res.status).toBe(400);
  });

  it("returns 404 when user is not a member of the project", async () => {
    setSession({ id: OTHER_USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue(null);
    const res = await POST(
      postReq({ projectId: PROJECT, kind: "project", title: "x", href: "/x" }),
      { params: {} } as never,
    );
    expect(res.status).toBe(404);
    expect(mockDb.$executeRaw).not.toHaveBeenCalled();
  });

  it("upserts via raw SQL for an authorized user", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.$executeRaw.mockResolvedValue(1 as never);

    const res = await POST(
      postReq({
        projectId: PROJECT,
        kind: "board",
        title: "QT board",
        meta: "Board • Test",
        href: "/spaces/proj_1/board",
      }),
      { params: {} } as never,
    );
    expect(res.status).toBe(200);
    expect(mockDb.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
