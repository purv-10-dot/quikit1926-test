/**
 * [P2.3] fireTrigger carries the trigger event id + type + trigger-time snapshot
 * on the enqueued job (SPEC §8 payload), so the worker can hand runFrom a real
 * trigger-time snapshot. Uses the REAL triggers module with Redis/queue mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDb } from "../../helpers/mockDb";
import type { CrmWorkflowDefinition, CrmLead } from "@quikit/database";

vi.mock("@/lib/db/redis", () => ({ isRedisEnabled: () => true }));
vi.mock("@/lib/queue/automation-queue", () => ({ enqueueAutomation: vi.fn().mockResolvedValue("job-1") }));
vi.mock("@/lib/services/automation/attribution", () => ({
  snapshotOf: () => ({ stage: "New Lead", substatus: "Negotiation" }),
}));

import { enqueueAutomation } from "@/lib/queue/automation-queue";

const db = mockDb();

beforeEach(() => vi.mocked(enqueueAutomation).mockClear());

describe("fireTrigger · trigger-time snapshot payload", () => {
  it("enqueues with triggerEventId + triggerType + triggerSnapshot", async () => {
    db.crmWorkflowDefinition.findMany.mockResolvedValue([
      {
        id: "wf1",
        graphNodes: [
          { id: "t", kind: "trigger_lead_updated", config: {} },
          { id: "a", kind: "update_lead_field", config: {} },
        ],
        graphEdges: [{ from: "t", to: "a" }],
      },
    ] as unknown as CrmWorkflowDefinition[]);
    db.crmLead.findFirst.mockResolvedValue(
      { id: "L1", tenantId: "t1", stage: "New Lead", substatus: "Negotiation" } as unknown as CrmLead,
    );

    const { onLeadUpdated } = await import("@/lib/services/automation/triggers");
    await onLeadUpdated("t1", "L1");

    expect(enqueueAutomation).toHaveBeenCalledTimes(1);
    const [data] = vi.mocked(enqueueAutomation).mock.calls[0] as unknown as [Record<string, unknown>];
    expect(data.triggerType).toBe("trigger_lead_updated");
    expect(typeof data.triggerEventId).toBe("string");
    expect(data.triggerSnapshot).toEqual({ stage: "New Lead", substatus: "Negotiation" });
    expect(data.startNodeId).toBe("a");
  });
});
