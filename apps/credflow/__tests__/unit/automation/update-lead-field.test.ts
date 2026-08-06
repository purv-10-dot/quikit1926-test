/**
 * [P1.1] update_lead_field action — routing + no-op + outbound-sync discipline.
 *
 * Proves at the unit level (with spies) the SPEC §5.3 contract:
 *   - stage field  → transition-service (never a raw crmLead.update)
 *   - status field → the PATCH/save path (updateCrmLead)
 *   - same-value   → no write, no emit
 *   - the action itself never calls triggerOutboundSync directly (both service
 *     paths emit it internally exactly once, so a direct call would double-emit).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDb } from "../../helpers/mockDb";
import type { CrmLead, CrmWorkflowDefinition } from "@quikit/database";

vi.mock("@/lib/services/leads/transition-service", () => ({
  transitionLead: vi.fn().mockResolvedValue({}),
  LeadTransitionError: class extends Error {},
}));
vi.mock("@/lib/services/leads/create-record", () => ({
  updateCrmLead: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/services/leadsquared/outbound-trigger", () => ({
  triggerOutboundSync: vi.fn(),
}));
vi.mock("@/lib/services/automation/loop-guard", () => ({
  recordWriteAndCheck: vi.fn().mockResolvedValue({ count: 1, terminated: false, cap: 50 }),
}));
vi.mock("@/lib/services/automation/attribution", () => ({
  recordAttribution: vi.fn(),
  snapshotOf: vi.fn(() => ({ stage: "New Lead" })),
}));

import { transitionLead } from "@/lib/services/leads/transition-service";
import { updateCrmLead } from "@/lib/services/leads/create-record";
import { triggerOutboundSync } from "@/lib/services/leadsquared/outbound-trigger";
import { recordWriteAndCheck } from "@/lib/services/automation/loop-guard";
import { recordAttribution } from "@/lib/services/automation/attribution";
import { AUTOMATION_ACTOR_ID } from "@/lib/services/automation/workflow-engine";

const db = mockDb();
const transition = vi.mocked(transitionLead);
const patch = vi.mocked(updateCrmLead);
const sync = vi.mocked(triggerOutboundSync);
const guard = vi.mocked(recordWriteAndCheck);
const attribution = vi.mocked(recordAttribution);

function defWith(node: { id: string; kind: string; config: Record<string, unknown> }) {
  db.crmWorkflowDefinition.findFirst.mockResolvedValue({
    id: "wf1",
    tenantId: "t1",
    status: "Active",
    graphNodes: [node],
    graphEdges: [],
  } as unknown as CrmWorkflowDefinition);
}

beforeEach(() => {
  transition.mockClear();
  patch.mockClear();
  sync.mockClear();
  guard.mockClear();
  guard.mockResolvedValue({ count: 1, terminated: false, cap: 50 });
  attribution.mockClear();
});

describe("workflow-engine · update_lead_field", () => {
  it("routes a STAGE change through transition-service with the automation actor", async () => {
    defWith({ id: "n1", kind: "update_lead_field", config: { field: "stage", value: "Negotiation" } });
    db.crmLead.findFirst.mockResolvedValue({ id: "lead-1", tenantId: "t1", stage: "New Lead" } as unknown as CrmLead);

    const { runFrom } = await import("@/lib/services/automation/workflow-engine");
    await runFrom("t1", "wf1", "lead-1", "n1");

    expect(transition).toHaveBeenCalledTimes(1);
    expect(transition).toHaveBeenCalledWith({
      user: expect.objectContaining({ tenantId: "t1", userId: AUTOMATION_ACTOR_ID }),
      leadId: "lead-1",
      input: { stage: "Negotiation" },
    });
    expect(patch).not.toHaveBeenCalled();
    // The action delegates the sync to transition-service; it must not emit itself.
    expect(sync).not.toHaveBeenCalled();
    // Attribution records the write with engineSource "automation".
    expect(attribution).toHaveBeenCalledTimes(1);
    expect(attribution).toHaveBeenCalledWith(
      expect.objectContaining({
        engineSource: "automation",
        workflowId: "wf1",
        nodeId: "n1",
        field: "stage",
        before: "New Lead",
        after: "Negotiation",
      }),
    );
  });

  it("routes a STATUS change through the PATCH/save path (updateCrmLead), not transition-service", async () => {
    defWith({ id: "n1", kind: "update_lead_field", config: { field: "status", value: "Disqualified" } });
    db.crmLead.findFirst.mockResolvedValue({ id: "lead-2", tenantId: "t1", status: "Open" } as unknown as CrmLead);

    const { runFrom } = await import("@/lib/services/automation/workflow-engine");
    await runFrom("t1", "wf1", "lead-2", "n1");

    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith("lead-2", { status: "Disqualified" });
    expect(transition).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
  });

  it("skips the write when the loop guard reports the lead Terminated", async () => {
    guard.mockResolvedValue({ count: 51, terminated: true, cap: 50 });
    defWith({ id: "n1", kind: "update_lead_field", config: { field: "stage", value: "Negotiation" } });
    db.crmLead.findFirst.mockResolvedValue({ id: "lead-9", tenantId: "t1", stage: "New Lead" } as unknown as CrmLead);

    const { runFrom } = await import("@/lib/services/automation/workflow-engine");
    await runFrom("t1", "wf1", "lead-9", "n1");

    expect(guard).toHaveBeenCalledTimes(1);
    expect(transition).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
    expect(attribution).not.toHaveBeenCalled();
  });

  it("is a NO-OP when the target equals the current value (no write, no emit)", async () => {
    defWith({ id: "n1", kind: "update_lead_field", config: { field: "stage", value: "Negotiation" } });
    db.crmLead.findFirst.mockResolvedValue({ id: "lead-3", tenantId: "t1", stage: "Negotiation" } as unknown as CrmLead);

    const { runFrom } = await import("@/lib/services/automation/workflow-engine");
    await runFrom("t1", "wf1", "lead-3", "n1");

    expect(transition).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
    // A no-op must not consume the per-lead/day loop budget.
    expect(guard).not.toHaveBeenCalled();
  });
});
