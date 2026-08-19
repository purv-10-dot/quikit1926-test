import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";

vi.mock("@/lib/services/workflow/resolve-workflow", () => ({
  resolveWorkflowGraph: vi.fn(),
}));
vi.mock("@/lib/services/workflow/execute-transition", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/workflow/execute-transition")>(
    "@/lib/services/workflow/execute-transition",
  );
  return { ...actual, executeTransition: vi.fn() };
});

// eslint-disable-next-line import/first
import { resolveWorkflowGraph } from "@/lib/services/workflow/resolve-workflow";
// eslint-disable-next-line import/first
import { executeTransition } from "@/lib/services/workflow/execute-transition";
// eslint-disable-next-line import/first
import { fireTriggerForIssues } from "@/lib/services/workflow/fire-trigger";

const mockResolveWorkflowGraph = vi.mocked(resolveWorkflowGraph);
const mockExecuteTransition = vi.mocked(executeTransition);

const ORG = "org_1";
const ISSUE_ID = "issue_1";
const PROJECT = "proj_1";

const GRAPH = {
  id: "wf_1",
  isActive: true,
  transitions: [
    {
      id: "t_1",
      name: "Done via PR merge",
      type: "NORMAL" as const,
      toStatusId: "status_done",
      fromStatusIds: ["status_in_progress"],
      rules: [],
    },
  ],
};

beforeEach(() => {
  resetMockDb();
  vi.clearAllMocks();
  mockDb.$transaction.mockImplementation((cb: unknown) =>
    (cb as (t: typeof mockDb) => Promise<unknown>)(mockDb),
  );
});

// SEC/audit regression: fire-trigger.ts wrote QtIssueTransitionLog rows for
// GitHub-webhook-driven auto-moves with no actorType/actingAgentId at all,
// so they silently fell back to the schema default actorType:"user" —
// misattributing a system move as a human one in the audit trail.
describe("fireTriggerForIssues — actor attribution", () => {
  it("records the auto-fired transition as actorType 'agent' with actingAgentId 'github-automation'", async () => {
    mockDb.qtIssue.findFirst.mockResolvedValue({
      id: ISSUE_ID,
      orgId: ORG,
      projectId: PROJECT,
      type: "TASK",
      statusId: "status_in_progress",
      assigneeId: null,
      resolutionId: null,
      priority: null,
      reporterId: null,
      title: "Fix the bug",
      description: null,
      storyPoints: null,
      eta: null,
      dueDate: null,
      startDate: null,
    } as never);
    mockResolveWorkflowGraph.mockResolvedValue(GRAPH as never);
    mockDb.qtWorkflowTrigger.findMany.mockResolvedValue([{ transitionId: "t_1" }] as never);
    mockExecuteTransition.mockResolvedValue({
      gated: true,
      patch: {},
      comments: [],
      transitionId: "t_1",
    } as never);
    mockDb.qtIssue.update.mockResolvedValue({} as never);
    mockDb.qtIssueTransitionLog.create.mockResolvedValue({} as never);

    const moved = await fireTriggerForIssues(ORG, [ISSUE_ID], "pr_merged");

    expect(moved).toBe(1);
    expect(mockDb.qtIssueTransitionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orgId: ORG,
          issueId: ISSUE_ID,
          actorId: "github-automation",
          actorType: "agent",
          actingAgentId: "github-automation",
        }),
      }),
    );
  });
});
