import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { PATCH, DELETE } from "@/app/api/sprints/[id]/route";

const USER = "user_1";
const TENANT = "tenant_1";
const SPRINT = "sprint_1";
const PROJECT = "proj_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function patchReq(body: unknown) {
  return new NextRequest(`http://localhost/api/sprints/${SPRINT}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function delReq() {
  return new NextRequest(`http://localhost/api/sprints/${SPRINT}`, {
    method: "DELETE",
  });
}

describe("PATCH /api/sprints/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await PATCH(patchReq({ name: "X" }), {
      params: { id: SPRINT },
    } as never);
    expect(res.status).toBe(401);
  });

  it("404 when sprint does not belong to the tenant", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtSprint.findFirst.mockResolvedValue(null);
    const res = await PATCH(patchReq({ name: "X" }), {
      params: { id: SPRINT },
    } as never);
    expect(res.status).toBe(404);
  });

  it("403 when user is a viewer", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtSprint.findFirst.mockResolvedValue({
      id: SPRINT,
      projectId: PROJECT,
      status: "PLANNING",
      name: "T2 Sprint 1",
    } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "VIEWER" } as never);
    const res = await PATCH(patchReq({ name: "X" }), {
      params: { id: SPRINT },
    } as never);
    expect(res.status).toBe(403);
  });

  it("updates the sprint when user is a project admin", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtSprint.findFirst.mockResolvedValue({
      id: SPRINT,
      projectId: PROJECT,
      status: "PLANNING",
      name: "T2 Sprint 1",
    } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({
      role: "PROJECT_ADMIN",
    } as never);
    mockDb.qtSprint.update.mockResolvedValue({ id: SPRINT } as never);

    const res = await PATCH(patchReq({ name: "Renamed" }), {
      params: { id: SPRINT },
    } as never);
    expect(res.status).toBe(200);
    expect(mockDb.qtSprint.update).toHaveBeenCalled();
  });
});

describe("DELETE /api/sprints/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await DELETE(delReq(), { params: { id: SPRINT } } as never);
    expect(res.status).toBe(401);
  });

  it("409 when sprint is ACTIVE", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtSprint.findFirst.mockResolvedValue({
      id: SPRINT,
      projectId: PROJECT,
      status: "ACTIVE",
      name: "T2 Sprint 1",
    } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({
      role: "PROJECT_ADMIN",
    } as never);

    const res = await DELETE(delReq(), { params: { id: SPRINT } } as never);
    expect(res.status).toBe(409);
  });

  it("soft-deletes a planning sprint and detaches issues", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtSprint.findFirst.mockResolvedValue({
      id: SPRINT,
      projectId: PROJECT,
      status: "PLANNING",
      name: "T2 Sprint 1",
    } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({
      role: "PROJECT_ADMIN",
    } as never);
    mockDb.$transaction.mockResolvedValue([{ count: 0 }, { id: SPRINT }] as never);

    const res = await DELETE(delReq(), { params: { id: SPRINT } } as never);
    expect(res.status).toBe(200);
    expect(mockDb.$transaction).toHaveBeenCalled();
  });
});
