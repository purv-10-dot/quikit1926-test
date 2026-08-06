/**
 * [P3.S2] Shared automated-write helper — the ONE implementation of the 1.3
 * write contract (SPEC §5.3). Extracted from workflow-engine's update_lead_field.
 *
 * Proves the contract directly (with spies), including the ownerId→PATCH path
 * that Track B's distribute_lead rewire (B3) will call — so B3 inherits a
 * proven write path rather than a second implementation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDb } from "../../helpers/mockDb";
import type { CrmLead } from "@quikit/database";

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

mockDb();
import { transitionLead } from "@/lib/services/leads/transition-service";
import { updateCrmLead } from "@/lib/services/leads/create-record";
import { triggerOutboundSync } from "@/lib/services/leadsquared/outbound-trigger";
import { recordWriteAndCheck } from "@/lib/services/automation/loop-guard";
import { recordAttribution } from "@/lib/services/automation/attribution";
import {
  applyAutomatedLeadWrite,
  AUTOMATION_ACTOR_ID,
} from "@/lib/services/automation/automated-write";

const transition = vi.mocked(transitionLead);
const patch = vi.mocked(updateCrmLead);
const sync = vi.mocked(triggerOutboundSync);
const guard = vi.mocked(recordWriteAndCheck);
const attribution = vi.mocked(recordAttribution);

function lead(overrides: Record<string, unknown> = {}): CrmLead {
  return { id: "lead-1", tenantId: "t1", stage: "New Lead", status: "Open", ownerId: null, ...overrides } as unknown as CrmLead;
}
const base = {
  tenantId: "t1",
  workflowId: "wf1",
  nodeId: "n1",
  triggerEventId: "evt1",
  triggerType: "trigger_lead_updated",
  snapshot: { stage: "New Lead" },
};

beforeEach(() => {
  transition.mockClear();
  patch.mockClear();
  sync.mockClear();
  guard.mockClear();
  guard.mockResolvedValue({ count: 1, terminated: false, cap: 50 });
  attribution.mockClear();
});

describe("applyAutomatedLeadWrite · 1.3 contract", () => {
  it("routes a STAGE change through transition-service with the automation actor, returns written", async () => {
    const l = lead({ stage: "New Lead" });
    const outcome = await applyAutomatedLeadWrite({ ...base, lead: l, field: "stage", value: "Negotiation" });

    expect(outcome).toBe("written");
    expect(transition).toHaveBeenCalledWith({
      user: expect.objectContaining({ tenantId: "t1", userId: AUTOMATION_ACTOR_ID }),
      leadId: "lead-1",
      input: { stage: "Negotiation" },
    });
    expect(patch).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled(); // transition-service emits sync itself
    expect(attribution).toHaveBeenCalledWith(
      expect.objectContaining({ engineSource: "automation", field: "stage", before: "New Lead", after: "Negotiation" }),
    );
    expect(l.stage).toBe("Negotiation"); // in-memory lead mutated for downstream nodes
  });

  it("routes a STATUS change through the PATCH path (updateCrmLead), not transition-service", async () => {
    const outcome = await applyAutomatedLeadWrite({ ...base, lead: lead({ status: "Open" }), field: "status", value: "Disqualified" });
    expect(outcome).toBe("written");
    expect(patch).toHaveBeenCalledWith("lead-1", { status: "Disqualified" });
    expect(transition).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
  });

  it("routes an OWNER change through the PATCH path — the path distribute_lead (B3) will reuse", async () => {
    const outcome = await applyAutomatedLeadWrite({ ...base, lead: lead({ ownerId: "u1" }), field: "ownerId", value: "u2" });
    expect(outcome).toBe("written");
    expect(patch).toHaveBeenCalledWith("lead-1", { ownerId: "u2" });
    expect(transition).not.toHaveBeenCalled();
    expect(attribution).toHaveBeenCalledWith(expect.objectContaining({ field: "ownerId", before: "u1", after: "u2" }));
  });

  it("is a NO-OP when target equals current (no guard, no write, no emit)", async () => {
    const outcome = await applyAutomatedLeadWrite({ ...base, lead: lead({ stage: "Negotiation" }), field: "stage", value: "Negotiation" });
    expect(outcome).toBe("noop");
    expect(guard).not.toHaveBeenCalled();
    expect(transition).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
    expect(attribution).not.toHaveBeenCalled();
  });

  it("returns terminated (no write, no attribution) when the loop guard trips", async () => {
    guard.mockResolvedValue({ count: 51, terminated: true, cap: 50 });
    const outcome = await applyAutomatedLeadWrite({ ...base, lead: lead(), field: "stage", value: "Negotiation" });
    expect(outcome).toBe("terminated");
    expect(transition).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
    expect(attribution).not.toHaveBeenCalled();
  });

  it("passes the engineSource through to the loop counter and attribution", async () => {
    await applyAutomatedLeadWrite({ ...base, lead: lead(), field: "status", value: "X", engineSource: "legacy-disposition" });
    expect(guard).toHaveBeenCalledWith(expect.objectContaining({ source: "legacy-disposition" }));
    expect(attribution).toHaveBeenCalledWith(expect.objectContaining({ engineSource: "legacy-disposition" }));
  });
});
