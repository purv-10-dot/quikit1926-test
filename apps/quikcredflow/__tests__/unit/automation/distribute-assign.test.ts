/**
 * [P3.B3] distribute_lead — sequential first-match + mandatory default (SPEC
 * §5.4), and the rewire of the owner-write onto the S2 shared write helper.
 *
 * Two layers proven here:
 *   - resolveAssignment (pure): rule ordering, catch-all, default fallback,
 *     legacy flat form.
 *   - the engine node: the owner change goes through applyAutomatedLeadWrite
 *     (field "ownerId"), NOT a raw crmLead.update — so it inherits the 1.3
 *     contract (loop-guard, PATCH+sync, attribution, no-op).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDb } from "../../helpers/mockDb";
import type { QcfLead, QcfWorkflowDefinition } from "@quikit/database";
import type { DistributeConfig } from "@/types/workflow";

vi.mock("@/lib/services/automation/automated-write", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/automation/automated-write")>(
    "@/lib/services/automation/automated-write",
  );
  return { ...actual, applyAutomatedLeadWrite: vi.fn().mockResolvedValue("written") };
});
vi.mock("@/lib/services/automation/lifecycle", () => ({
  canResumeInFlight: vi.fn().mockReturnValue(true),
}));

import { resolveAssignment } from "@/lib/services/automation/distribution";
import { applyAutomatedLeadWrite } from "@/lib/services/automation/automated-write";

const db = mockDb();
const write = vi.mocked(applyAutomatedLeadWrite);

function lead(overrides: Record<string, unknown> = {}): QcfLead {
  return { id: "lead-1", orgId: "t1", stage: "New", status: "Open", ownerId: "u0", ...overrides } as unknown as QcfLead;
}

describe("resolveAssignment · sequential first-match + default", () => {
  const cfg: DistributeConfig = {
    rules: [
      { conditions: [{ field: "stage", op: "eq", value: "Hot" }], candidateUserIds: ["a1"] },
      { conditions: [{ field: "status", op: "in", value: ["Open"] }], candidateUserIds: ["b1", "b2"] },
    ],
    defaultUserIds: ["d1"],
  };

  it("returns the FIRST matching rule's pool (rule 2 when rule 1 misses)", () => {
    expect(resolveAssignment(lead({ stage: "Cold", status: "Open" }), cfg)).toEqual({
      candidateUserIds: ["b1", "b2"],
      ruleKey: "rule1",
    });
  });
  it("prefers rule 1 when it matches (order matters)", () => {
    expect(resolveAssignment(lead({ stage: "Hot", status: "Open" }), cfg)).toEqual({
      candidateUserIds: ["a1"],
      ruleKey: "rule0",
    });
  });
  it("falls back to the mandatory default when NO rule matches", () => {
    expect(resolveAssignment(lead({ stage: "Cold", status: "Closed" }), cfg)).toEqual({
      candidateUserIds: ["d1"],
      ruleKey: "default",
    });
  });
  it("treats an empty condition group as a catch-all rule", () => {
    expect(resolveAssignment(lead({ stage: "Cold", status: "Closed" }), { rules: [{ conditions: [], candidateUserIds: ["c1"] }] })).toEqual({
      candidateUserIds: ["c1"],
      ruleKey: "rule0",
    });
  });
  it("returns null when no rule matches and there is no default", () => {
    expect(resolveAssignment(lead({ stage: "Cold", status: "Closed" }), { rules: [{ conditions: [{ field: "stage", op: "eq", value: "Hot" }], candidateUserIds: ["a1"] }] })).toBeNull();
  });
  it("supports the legacy flat form (ruleKey empty → bare node id cursor)", () => {
    expect(resolveAssignment(lead(), { candidateUserIds: ["x1", "x2"] })).toEqual({
      candidateUserIds: ["x1", "x2"],
      ruleKey: "",
    });
  });
});

describe("workflow-engine · distribute_lead rewire", () => {
  function defWith(config: DistributeConfig) {
    db.qcfWorkflowDefinition.findFirst.mockResolvedValue({
      id: "wf1",
      orgId: "t1",
      status: "Active",
      triggerType: "trigger_lead_updated",
      graphNodes: [{ id: "n1", kind: "distribute_lead", config }],
      graphEdges: [],
    } as unknown as QcfWorkflowDefinition);
  }

  beforeEach(() => {
    write.mockClear();
    write.mockResolvedValue("written");
    db.qcfAutomationDistributionState.upsert.mockResolvedValue({ lastIndex: 0 } as never);
  });

  it("routes the owner change through applyAutomatedLeadWrite (field ownerId), never a raw update", async () => {
    defWith({ rules: [{ conditions: [], candidateUserIds: ["u5"] }], defaultUserIds: ["dX"] });
    db.qcfLead.findFirst.mockResolvedValue(lead({ ownerId: "u0" }) as never);

    const { runFrom } = await import("@/lib/services/automation/workflow-engine");
    await runFrom("t1", "wf1", "lead-1", "n1");

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "t1", field: "ownerId", value: "u5", nodeId: "n1", workflowId: "wf1" }),
    );
    // The raw owner write is gone — the helper owns the write path.
    expect(db.qcfLead.update).not.toHaveBeenCalled();
  });

  it("does not write when nothing is assignable (no rule matched, no default)", async () => {
    defWith({ rules: [{ conditions: [{ field: "stage", op: "eq", value: "Hot" }], candidateUserIds: ["u5"] }] });
    db.qcfLead.findFirst.mockResolvedValue(lead({ stage: "Cold" }) as never);

    const { runFrom } = await import("@/lib/services/automation/workflow-engine");
    await runFrom("t1", "wf1", "lead-1", "n1");

    expect(write).not.toHaveBeenCalled();
  });
});
