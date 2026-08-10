import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET } from "@/app/api/issues/[id]/transitions/route";

const USER = "user_1";
const TENANT = "tenant_1";
const ISSUE = "issue_1";
const PROJECT = "proj_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function req() {
  return new NextRequest(`http://localhost/api/issues/${ISSUE}/transitions`);
}

/** Make the caller a global admin so the coarse read-gate passes. */
function asAdmin() {
  setSession({ id: USER, orgId: TENANT, role: "member" });
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
}

describe("GET /api/issues/:id/transitions", () => {
  it("401 when unauthenticated", async () => {
    const res = await GET(req(), { params: { id: ISSUE } } as never);
    expect(res.status).toBe(401);
  });

  it("404 when the issue belongs to another tenant", async () => {
    asAdmin();
    mockDb.qtIssue.findFirst.mockResolvedValue(null);
    const res = await GET(req(), { params: { id: ISSUE } } as never);
    expect(res.status).toBe(404);
  });

  it("gated=false when the project has no workflow scheme", async () => {
    asAdmin();
    mockDb.qtIssue.findFirst.mockResolvedValue({
      id: ISSUE,
      projectId: PROJECT,
      statusId: "todo",
      type: "Task",
    } as never);
    mockDb.qtWorkflowScheme.findUnique.mockResolvedValue(null);

    const res = await GET(req(), { params: { id: ISSUE } } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.gated).toBe(false);
    expect(body.data.transitions).toEqual([]);
  });

  it("returns the legal transitions for a gated issue", async () => {
    asAdmin();
    mockDb.qtIssue.findFirst.mockResolvedValue({
      id: ISSUE,
      projectId: PROJECT,
      statusId: "todo",
      type: "Task",
    } as never);
    // Scheme → default item → workflow.
    mockDb.qtWorkflowScheme.findUnique.mockResolvedValue({
      items: [{ isDefault: true, workflowId: "wf1", issueType: null }],
    } as never);
    // Published workflow with one NORMAL edge todo→doing + a GLOBAL done.
    mockDb.qtWorkflow.findFirst.mockResolvedValue({
      id: "wf1",
      isActive: true,
      transitions: [
        {
          id: "t1",
          name: "Start",
          type: "NORMAL",
          toStatusId: "doing",
          fromStatuses: [{ statusId: "todo" }],
          rules: [],
        },
        {
          id: "t2",
          name: "Done",
          type: "GLOBAL",
          toStatusId: "done",
          fromStatuses: [],
          rules: [],
        },
      ],
    } as never);

    const res = await GET(req(), { params: { id: ISSUE } } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.gated).toBe(true);
    const targets = body.data.transitions.map((t: { toStatusId: string }) => t.toStatusId);
    expect(targets.sort()).toEqual(["doing", "done"]);
  });
});
