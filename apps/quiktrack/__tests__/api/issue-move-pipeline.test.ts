import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { PATCH } from "@/app/api/issues/[id]/move/route";

const USER = "user_1";
const TENANT = "tenant_1";
const ISSUE = "issue_1";
const PROJECT = "proj_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function req(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/issues/${ISSUE}/move`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** Admin caller; issue is on s_todo. */
function seedIssue(over: Record<string, unknown> = {}) {
  setSession({ id: USER, orgId: TENANT, role: "member" });
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
  mockDb.qtIssue.findFirst.mockResolvedValue({
    id: ISSUE,
    projectId: PROJECT,
    statusId: "s_todo",
    type: "Task",
    assigneeId: null,
    resolutionId: null,
    priority: "MEDIUM",
    ...over,
  } as never);
  mockDb.qtIssue.update.mockImplementation((args: { data: unknown }) =>
    Promise.resolve({ id: ISSUE, ...(args.data as object) }) as never,
  );
  mockDb.qtIssueTransitionLog.create.mockResolvedValue({} as never);
  // The route wraps update + log in db.$transaction — run the callback against
  // mockDb so qtIssue.update still records its call.
  (mockDb.$transaction as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(
    (cb: unknown) => (cb as (t: typeof mockDb) => Promise<unknown>)(mockDb),
  );
}

/** No published workflow → any→any (opt-in off). */
function noWorkflow() {
  mockDb.qtWorkflowScheme.findUnique.mockResolvedValue(null);
}

/** A published workflow: s_todo→s_done, with a set_resolution post-function. */
function workflowWithResolution() {
  mockDb.qtWorkflowScheme.findUnique.mockResolvedValue({
    items: [{ isDefault: true, workflowId: "wf1", issueType: null }],
  } as never);
  mockDb.qtWorkflow.findFirst.mockResolvedValue({
    id: "wf1",
    isActive: true,
    transitions: [
      {
        id: "t_done",
        name: "Finish",
        type: "NORMAL",
        toStatusId: "s_done",
        fromStatuses: [{ statusId: "s_todo" }],
        rules: [
          {
            id: "r1",
            kind: "POSTFUNCTION",
            type: "set_resolution",
            config: { resolutionId: "res_done" },
            errorMessage: null,
            groupNo: 0,
            orderNo: 0,
          },
        ],
      },
    ],
  } as never);
  mockDb.qtIssueStatus.findUnique.mockResolvedValue({ category: "DONE" } as never);
}

describe("PATCH /api/issues/:id/move — Phase 4 pipeline", () => {
  it("409 STALE_STATUS when expectedStatusId no longer matches", async () => {
    seedIssue({ statusId: "s_doing" }); // issue already moved on
    noWorkflow();
    const res = await PATCH(req({ statusId: "s_done", expectedStatusId: "s_todo" }), {
      params: { id: ISSUE },
    } as never);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("STALE_STATUS");
    expect(body.currentStatusId).toBe("s_doing");
  });

  it("applies a set_resolution post-function on a governed move", async () => {
    seedIssue();
    workflowWithResolution();
    const res = await PATCH(req({ statusId: "s_done" }), { params: { id: ISSUE } } as never);
    expect(res.status).toBe(200);
    const updateArg = mockDb.qtIssue.update.mock.calls[0][0] as { data: { resolutionId?: string } };
    expect(updateArg.data.resolutionId).toBe("res_done");
  });

  it("passes through untouched when no workflow governs the project", async () => {
    seedIssue();
    noWorkflow();
    const res = await PATCH(req({ statusId: "s_done" }), { params: { id: ISSUE } } as never);
    expect(res.status).toBe(200);
    const updateArg = mockDb.qtIssue.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect("resolutionId" in updateArg.data).toBe(false);
  });
});
