import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { PATCH } from "@/app/api/issues/[id]/move/route";

// WF-10.3 — the move endpoint must server-enforce the workflow: a condition
// failure → 403, an illegal/unavailable transition → 409, a validator failure
// → 422 with NO write. These paths are implemented in the route; this file
// asserts them through the API (they were previously only unit-tested).

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

/** Caller is a project member (not admin) so conditions/permissions actually gate. */
function seedMemberOnIssue(over: Record<string, unknown> = {}) {
  setSession({ id: USER, orgId: TENANT, role: "member" });
  // hasAdminAccess → not an admin (member role, no admin tier).
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
  // userCanInProject → project membership present, Issue:update granted (so the
  // *outer* route guard passes; the workflow rules are what we're testing).
  mockDb.qtProjectUserRole.findUnique.mockResolvedValue({
    projectRoleId: "role_1",
    projectRole: { name: "Contributor" },
  } as never);
  mockDb.qtProjectRolePermission.findFirst.mockResolvedValue({ id: "perm_issue_update" } as never);
  mockDb.qtUserPermissionExtra.findFirst.mockResolvedValue(null);
  mockDb.qtIssue.findFirst.mockResolvedValue({
    id: ISSUE,
    projectId: PROJECT,
    statusId: "s_todo",
    type: "Task",
    assigneeId: null, // NOT the acting user → is_assignee condition fails
    resolutionId: null,
    priority: "MEDIUM",
    ...over,
  } as never);
  mockDb.qtIssue.update.mockImplementation((args: { data: unknown }) =>
    Promise.resolve({ id: ISSUE, ...(args.data as object) }) as never,
  );
  mockDb.qtIssueTransitionLog.create.mockResolvedValue({} as never);
  (mockDb.$transaction as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(
    (cb: unknown) => (cb as (t: typeof mockDb) => Promise<unknown>)(mockDb),
  );
}

function workflow(transitions: unknown[]) {
  mockDb.qtWorkflowScheme.findUnique.mockResolvedValue({
    items: [{ isDefault: true, workflowId: "wf1", issueType: null }],
  } as never);
  mockDb.qtWorkflow.findFirst.mockResolvedValue({
    id: "wf1",
    isActive: true,
    transitions,
  } as never);
  mockDb.qtIssueStatus.findUnique.mockResolvedValue({ category: "IN_PROGRESS" } as never);
}

const rule = (o: Record<string, unknown>) => ({
  id: "r",
  errorMessage: null,
  groupNo: 0,
  orderNo: 0,
  ...o,
});

describe("PATCH /api/issues/:id/move — WF-10.3 security enforcement", () => {
  it("403 when a condition fails (is_assignee, actor is not the assignee)", async () => {
    seedMemberOnIssue({ assigneeId: "someone_else" });
    workflow([
      {
        id: "t_start",
        name: "Start",
        type: "NORMAL",
        toStatusId: "s_doing",
        fromStatuses: [{ statusId: "s_todo" }],
        rules: [rule({ kind: "CONDITION", type: "is_assignee", config: {} })],
      },
    ]);
    const res = await PATCH(req({ statusId: "s_doing" }), { params: { id: ISSUE } } as never);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("TRANSITION_CONDITIONS_FAILED");
    expect(mockDb.qtIssue.update).not.toHaveBeenCalled();
  });

  it("409 when the transition is not on the graph (illegal move)", async () => {
    seedMemberOnIssue();
    workflow([
      {
        id: "t_start",
        name: "Start",
        type: "NORMAL",
        toStatusId: "s_doing",
        fromStatuses: [{ statusId: "s_todo" }],
        rules: [],
      },
    ]);
    // Ask to jump straight to s_done — no such edge from s_todo.
    const res = await PATCH(req({ statusId: "s_done" }), { params: { id: ISSUE } } as never);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("TRANSITION_NOT_ALLOWED");
    expect(mockDb.qtIssue.update).not.toHaveBeenCalled();
  });

  it("422 when a validator fails, with NO write", async () => {
    seedMemberOnIssue(); // resolutionId is null
    workflow([
      {
        id: "t_done",
        name: "Finish",
        type: "NORMAL",
        toStatusId: "s_done",
        fromStatuses: [{ statusId: "s_todo" }],
        rules: [
          rule({
            kind: "VALIDATOR",
            type: "field_required",
            config: { fieldId: "resolutionId" },
            errorMessage: "Resolution is required.",
          }),
        ],
      },
    ]);
    const res = await PATCH(req({ statusId: "s_done" }), { params: { id: ISSUE } } as never);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("TRANSITION_VALIDATION_FAILED");
    expect(body.failures[0].message).toBe("Resolution is required.");
    expect(mockDb.qtIssue.update).not.toHaveBeenCalled();
  });
});
