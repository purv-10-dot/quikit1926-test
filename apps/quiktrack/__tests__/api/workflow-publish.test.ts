import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { POST } from "@/app/api/workflows/[wfId]/publish/route";
import type { WorkflowDraft } from "@/lib/services/workflow";

/** groupBy's deep-mock type isn't a plain mock fn — cast to set its result. */
function mockGroupBy(rows: Array<{ statusId: string; _count: { _all: number } }>) {
  (mockDb.qtIssue.groupBy as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(
    rows,
  );
}

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
  // No issues on dropped statuses by default (migration is a no-op).
  mockGroupBy([]);
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

  it("422 NEEDS_MIGRATION when issues sit on a status the draft removes", async () => {
    asAdminWithWorkflow();
    // Draft keeps only s_done (drops s_todo), but 3 issues are on s_todo.
    const draft: WorkflowDraft = {
      ...validDraft,
      statuses: [{ statusId: "s_done", isInitial: true, x: 0, y: 0 }],
      transitions: [
        { id: "init", name: "Create", type: "INITIAL", toStatusId: "s_done", fromStatusIds: [] },
      ],
    };
    mockDb.qtWorkflowScheme.findUnique.mockResolvedValue({ hasDraft: true, draftJson: draft } as never);
    mockGroupBy([{ statusId: "s_todo", _count: { _all: 3 } }]);
    mockDb.qtIssueStatus.findMany
      .mockResolvedValueOnce([{ id: "s_todo" }, { id: "s_done" }] as never) // project-status guard
      .mockResolvedValueOnce([{ id: "s_todo", name: "To Do" }] as never); // migration names

    const res = await POST(req(), { params: { wfId: WF } } as never);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("NEEDS_MIGRATION");
    expect(body.migration).toEqual([{ statusId: "s_todo", statusName: "To Do", count: 3 }]);
  });

  it("migrates affected issues and publishes when a mapping is supplied", async () => {
    asAdminWithWorkflow();
    const draft: WorkflowDraft = {
      ...validDraft,
      statuses: [{ statusId: "s_done", isInitial: true, x: 0, y: 0 }],
      transitions: [
        { id: "init", name: "Create", type: "INITIAL", toStatusId: "s_done", fromStatusIds: [] },
      ],
    };
    mockDb.qtWorkflowScheme.findUnique.mockResolvedValue({ hasDraft: true, draftJson: draft } as never);
    mockGroupBy([{ statusId: "s_todo", _count: { _all: 2 } }]);

    let migratedTo: string | null = null;
    let loggedCount = 0;
    mockDb.$transaction.mockImplementation(async (cb: unknown) => {
      const tx = {
        qtIssue: {
          findMany: () => Promise.resolve([{ id: "i1" }, { id: "i2" }]),
          updateMany: (args: { data: { statusId: string } }) => {
            migratedTo = args.data.statusId;
            return Promise.resolve({ count: 2 });
          },
        },
        qtIssueTransitionLog: {
          createMany: (args: { data: unknown[] }) => {
            loggedCount = args.data.length;
            return Promise.resolve({});
          },
        },
        // Board-column remap: old status s_todo wasn't column-mapped → findUnique
        // returns null so the remap skips it cleanly.
        qtBoardColumnStatus: {
          findUnique: () => Promise.resolve(null),
          delete: () => Promise.resolve({}),
          create: () => Promise.resolve({}),
        },
        qtWorkflowStatus: { deleteMany: () => Promise.resolve({}), createMany: () => Promise.resolve({}) },
        qtWorkflowTransition: { deleteMany: () => Promise.resolve({}), create: () => Promise.resolve({ id: "new_t" }) },
        qtWorkflowTransitionFrom: { createMany: () => Promise.resolve({}) },
        qtWorkflowRule: { createMany: () => Promise.resolve({}) },
        qtWorkflow: { update: () => Promise.resolve({}) },
        qtWorkflowScheme: { update: () => Promise.resolve({}) },
        // Retire dropped statuses (soft-delete).
        qtIssueStatus: { updateMany: () => Promise.resolve({ count: 1 }) },
      };
      return (cb as (t: unknown) => Promise<unknown>)(tx);
    });

    const r = new NextRequest(`http://localhost/api/workflows/${WF}/publish`, {
      method: "POST",
      body: JSON.stringify({ statusMapping: { s_todo: "s_done" } }),
    });
    const res = await POST(r, { params: { wfId: WF } } as never);
    expect(res.status).toBe(200);
    expect(migratedTo).toBe("s_done");
    expect(loggedCount).toBe(2);
  });
});
