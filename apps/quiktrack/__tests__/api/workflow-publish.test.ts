import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { POST } from "@/app/api/workflows/[wfId]/publish/route";
import type { WorkflowDraft } from "@/lib/services/workflow";

const USER = "user_1";
const TENANT = "tenant_1";
const WF = "wf1";
const PROJECT = "proj_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function req() {
  return new NextRequest(`http://localhost/api/workflows/${WF}/publish`, { method: "POST" });
}

/** Admin caller; workflow belongs to the project. */
function asAdminWithWorkflow() {
  setSession({ id: USER, orgId: TENANT, role: "member" });
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
  mockDb.qtWorkflow.findFirst.mockResolvedValue({ id: WF, projectId: PROJECT } as never);
  mockDb.qtIssueStatus.findMany.mockResolvedValue([
    { id: "s_todo" },
    { id: "s_done" },
  ] as never);
}

const validDraft: WorkflowDraft = {
  workflowId: WF,
  name: "WF",
  description: null,
  statuses: [
    { statusId: "s_todo", isInitial: true, x: 0, y: 0 },
    { statusId: "s_done", isInitial: false, x: 0, y: 0 },
  ],
  transitions: [
    { id: "init", name: "Create", type: "INITIAL", toStatusId: "s_todo", fromStatusIds: [] },
    { id: "t1", name: "Finish", type: "NORMAL", toStatusId: "s_done", fromStatusIds: ["s_todo"] },
  ],
};

describe("POST /api/workflows/:wfId/publish", () => {
  it("401 when unauthenticated", async () => {
    const res = await POST(req(), { params: { wfId: WF } } as never);
    expect(res.status).toBe(401);
  });

  it("400 when there is no draft to publish", async () => {
    asAdminWithWorkflow();
    mockDb.qtWorkflowScheme.findUnique.mockResolvedValue({ hasDraft: false, draftJson: null } as never);
    const res = await POST(req(), { params: { wfId: WF } } as never);
    expect(res.status).toBe(400);
  });

  it("422 with errors when the graph is invalid (unreachable status)", async () => {
    asAdminWithWorkflow();
    const badDraft: WorkflowDraft = {
      ...validDraft,
      transitions: [
        { id: "init", name: "Create", type: "INITIAL", toStatusId: "s_todo", fromStatusIds: [] },
        // no edge to s_done → unreachable
      ],
    };
    mockDb.qtWorkflowScheme.findUnique.mockResolvedValue({ hasDraft: true, draftJson: badDraft } as never);

    const res = await POST(req(), { params: { wfId: WF } } as never);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errors.some((e: { code: string }) => e.code === "UNREACHABLE_STATUS")).toBe(true);
  });

  it("publishes a valid draft and clears it", async () => {
    asAdminWithWorkflow();
    mockDb.qtWorkflowScheme.findUnique.mockResolvedValue({ hasDraft: true, draftJson: validDraft } as never);
    mockDb.$transaction.mockImplementation(async (cb: unknown) => {
      const tx = {
        qtWorkflowStatus: { deleteMany: () => Promise.resolve({}), createMany: () => Promise.resolve({}) },
        qtWorkflowTransition: {
          deleteMany: () => Promise.resolve({}),
          create: () => Promise.resolve({ id: "new_t" }),
        },
        qtWorkflowTransitionFrom: { createMany: () => Promise.resolve({}) },
        qtWorkflow: { update: () => Promise.resolve({}) },
        qtWorkflowScheme: { update: () => Promise.resolve({}) },
      };
      return (cb as (t: unknown) => Promise<unknown>)(tx);
    });

    const res = await POST(req(), { params: { wfId: WF } } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.active).toBe(true);
  });
});
