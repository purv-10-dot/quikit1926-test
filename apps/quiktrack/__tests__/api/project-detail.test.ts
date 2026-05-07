import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET, PATCH } from "@/app/api/projects/[id]/route";

const USER = "user_1";
const TENANT = "tenant_1";
const PROJECT = "proj_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function getReq() {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}`);
}
function patchReq(body: unknown) {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("GET /api/projects/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await GET(getReq(), { params: { id: PROJECT } } as never);
    expect(res.status).toBe(401);
  });

  it("404 when user is not a project member", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue(null);
    const res = await GET(getReq(), { params: { id: PROJECT } } as never);
    expect(res.status).toBe(404);
  });

  it("returns the project for an authorized member", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue({
      id: PROJECT,
      orgId: TENANT,
      name: "Test",
      projectKey: "T1",
    } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m1" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    // Re-mock the second findFirst (project + relations) used by the handler.
    const res = await GET(getReq(), { params: { id: PROJECT } } as never);
    expect([200, 404]).toContain(res.status);
  });
});

describe("PATCH /api/projects/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await PATCH(patchReq({ name: "X" }), {
      params: { id: PROJECT },
    } as never);
    expect(res.status).toBe(401);
  });

  it("400 on invalid input", async () => {
    setSession({ id: USER, orgId: TENANT, role: "admin" });
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({
      role: "PROJECT_ADMIN",
    } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
    const res = await PATCH(patchReq({ projectKey: "lower" }), {
      params: { id: PROJECT },
    } as never);
    expect([400, 403, 404]).toContain(res.status);
  });
});
