import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { POST } from "@/app/api/docs/[id]/shares/route";

const USER = "user_1";
const TENANT = "tenant_1";
const DOC = "doc_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

const ROUTE_CTX = { params: { id: DOC } } as never;

function postReq(body: unknown) {
  return new NextRequest(`http://localhost/api/docs/${DOC}/shares`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/docs/[id]/shares", () => {
  it("401 when unauthenticated", async () => {
    const res = await POST(postReq({ userId: "u2", role: "viewer" }), ROUTE_CTX);
    expect(res.status).toBe(401);
  });

  it("404 when the doc doesn't exist", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.$queryRaw.mockResolvedValue([] as never); // loadDoc → none
    const res = await POST(postReq({ userId: "u2", role: "viewer" }), ROUTE_CTX);
    expect(res.status).toBe(404);
  });

  // Only the owner or an admin can share. A non-owner, non-admin is blocked.
  it("403 when a non-owner, non-admin tries to share", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.$queryRaw.mockResolvedValue([
      { id: DOC, orgId: TENANT, projectId: "proj_1", createdBy: "someone_else", status: "published", shareToken: null, shareMode: null },
    ] as never);
    // hasAdminAccess → not an admin.
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
    mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);

    const res = await POST(postReq({ userId: "u2", role: "viewer" }), ROUTE_CTX);
    expect(res.status).toBe(403);
    expect(mockDb.$executeRaw).not.toHaveBeenCalled();
  });

  it("owner can add an org member as a viewer", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.$queryRaw.mockResolvedValue([
      { id: DOC, orgId: TENANT, projectId: "proj_1", createdBy: USER, status: "published", shareToken: null, shareMode: null },
    ] as never);
    // Target is an active org member.
    mockDb.orgMember.findFirst.mockResolvedValue({ id: "m" } as never);
    mockDb.$executeRaw.mockResolvedValue(1 as never);

    const res = await POST(postReq({ userId: "u2", role: "viewer" }), ROUTE_CTX);
    expect(res.status).toBe(201);
    expect(mockDb.$executeRaw).toHaveBeenCalled();
  });

  it("400 on an invalid role", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.$queryRaw.mockResolvedValue([
      { id: DOC, orgId: TENANT, projectId: "proj_1", createdBy: USER, status: "published", shareToken: null, shareMode: null },
    ] as never);
    const res = await POST(postReq({ userId: "u2", role: "admin" }), ROUTE_CTX);
    expect(res.status).toBe(400);
  });
});
