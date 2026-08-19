import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET, PATCH, DELETE } from "@/app/api/workflows/[id]/route";

function req(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost"), init as ConstructorParameters<typeof NextRequest>[1]);
}

const ADMIN = { id: "u_admin", orgId: "org_A", membershipRole: "org_admin" };
const MEMBER = { id: "u_member", orgId: "org_A", membershipRole: "employee" };

const params = { params: { id: "wf1" } };

beforeEach(() => resetMockDb());

describe("GET /api/workflows/:id", () => {
  it("returns 401 when unauthenticated", async () => {
    setSession(null);
    const res = await GET(req("/api/workflows/wf1"), params);
    expect(res.status).toBe(401);
  });

  it("excludes soft-deleted workflows from lookup (loadVisible filters deletedAt)", async () => {
    setSession(MEMBER);
    mockDb.wfWorkflow.findFirst.mockResolvedValue(null);

    const res = await GET(req("/api/workflows/wf1"), params);

    expect(res.status).toBe(404);
    const where = mockDb.wfWorkflow.findFirst.mock.calls[0][0]?.where;
    expect(where?.deletedAt).toBeNull();
  });
});

describe("DELETE /api/workflows/:id", () => {
  it("returns 401 when unauthenticated", async () => {
    setSession(null);
    const res = await DELETE(req("/api/workflows/wf1", { method: "DELETE" }), params);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the workflow doesn't exist or is already soft-deleted", async () => {
    setSession(MEMBER);
    mockDb.wfWorkflow.findFirst.mockResolvedValue(null);

    const res = await DELETE(req("/api/workflows/wf1", { method: "DELETE" }), params);

    expect(res.status).toBe(404);
    expect(mockDb.wfWorkflow.update).not.toHaveBeenCalled();
  });

  it("rejects a member deleting an org-wide workflow with 403 (tenant/permission isolation)", async () => {
    setSession(MEMBER);
    mockDb.wfWorkflow.findFirst.mockResolvedValue({
      id: "wf1",
      orgId: "org_A",
      scope: "org",
      ownerId: "u_admin",
      trigger: {},
      status: "Active",
    } as never);

    const res = await DELETE(req("/api/workflows/wf1", { method: "DELETE" }), params);

    expect(res.status).toBe(403);
    expect(mockDb.wfWorkflow.update).not.toHaveBeenCalled();
  });

  it("soft-deletes on the happy path (sets deletedAt, never hard-deletes)", async () => {
    setSession(ADMIN);
    mockDb.wfWorkflow.findFirst.mockResolvedValue({
      id: "wf1",
      orgId: "org_A",
      scope: "org",
      ownerId: "u_admin",
      trigger: {},
      status: "Active",
    } as never);
    mockDb.wfWorkflow.update.mockResolvedValue({ id: "wf1" } as never);

    const res = await DELETE(req("/api/workflows/wf1", { method: "DELETE" }), params);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockDb.wfWorkflow.delete).not.toHaveBeenCalled();
    const call = mockDb.wfWorkflow.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: "wf1" });
    expect(call.data.deletedAt).toBeInstanceOf(Date);
  });

  it("lets a member soft-delete their own personal workflow", async () => {
    setSession(MEMBER);
    mockDb.wfWorkflow.findFirst.mockResolvedValue({
      id: "wf1",
      orgId: "org_A",
      scope: "personal",
      ownerId: "u_member",
      trigger: {},
      status: "Draft",
    } as never);
    mockDb.wfWorkflow.update.mockResolvedValue({ id: "wf1" } as never);

    const res = await DELETE(req("/api/workflows/wf1", { method: "DELETE" }), params);

    expect(res.status).toBe(200);
    expect(mockDb.wfWorkflow.update).toHaveBeenCalled();
  });
});

describe("PATCH /api/workflows/:id (regression: still excludes deleted workflows)", () => {
  it("returns 404 for a workflow that no longer resolves via loadVisible", async () => {
    setSession(ADMIN);
    mockDb.wfWorkflow.findFirst.mockResolvedValue(null);

    const res = await PATCH(
      req("/api/workflows/wf1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Renamed" }),
      }),
      params,
    );

    expect(res.status).toBe(404);
  });
});
