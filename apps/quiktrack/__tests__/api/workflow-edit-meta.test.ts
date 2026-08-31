import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { PATCH } from "@/app/api/workflows/[wfId]/route";

const USER = "user_1";
const TENANT = "tenant_1";
const PROJECT = "proj_1";
const WF = "wf_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function req(body: unknown) {
  return new NextRequest(`http://localhost/api/workflows/${WF}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Org owner → hasAdminAccess() short-circuits canEditWorkflow. */
function asOwner() {
  setSession({ id: USER, orgId: TENANT, role: "member" });
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
}

describe("PATCH /api/workflows/:wfId (edit name & description)", () => {
  it("401 when unauthenticated", async () => {
    const res = await PATCH(req({ name: "New" }), { params: { wfId: WF } } as never);
    expect(res.status).toBe(401);
  });

  it("404 when the workflow is not in the caller's org", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtWorkflow.findFirst.mockResolvedValue(null); // loadOwnedWorkflow → not found
    const res = await PATCH(req({ name: "New" }), { params: { wfId: WF } } as never);
    expect(res.status).toBe(404);
  });

  it("400 on an empty name", async () => {
    asOwner();
    mockDb.qtWorkflow.findFirst.mockResolvedValue({
      id: WF, projectId: PROJECT, name: "Old", description: null,
    } as never);
    const res = await PATCH(req({ name: "   " }), { params: { wfId: WF } } as never);
    expect(res.status).toBe(400);
  });

  it("409 when another workflow in the space already has that name", async () => {
    asOwner();
    // 1st findFirst = loadOwnedWorkflow (this wf); 2nd = the name-clash lookup.
    mockDb.qtWorkflow.findFirst
      .mockResolvedValueOnce({ id: WF, projectId: PROJECT, name: "Old", description: null } as never)
      .mockResolvedValueOnce({ id: "wf_other" } as never);
    const res = await PATCH(req({ name: "Taken" }), { params: { wfId: WF } } as never);
    expect(res.status).toBe(409);
  });

  it("updates name + description on the happy path", async () => {
    asOwner();
    mockDb.qtWorkflow.findFirst
      .mockResolvedValueOnce({ id: WF, projectId: PROJECT, name: "Old", description: null } as never)
      .mockResolvedValueOnce(null); // no name clash
    mockDb.qtWorkflow.update.mockResolvedValue({
      id: WF, name: "Renamed", description: "A new description",
    } as never);

    const res = await PATCH(
      req({ name: "Renamed", description: "A new description" }),
      { params: { wfId: WF } } as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Renamed");
    expect(mockDb.qtWorkflow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: WF },
        data: expect.objectContaining({ name: "Renamed", description: "A new description", updatedBy: USER }),
      }),
    );
  });
});
