import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ enqueue: vi.fn() }));
vi.mock("@/lib/queue/leadsquared-queue", () => ({ enqueueLeadSquaredSyncSafe: h.enqueue }));

import { triggerOutboundSync } from "@/lib/services/leadsquared/outbound-trigger";

beforeEach(() => h.enqueue.mockReset().mockResolvedValue("job-1"));

describe("triggerOutboundSync (shared helper)", () => {
  it("enqueues an outbound sync with the given tenantId + crmLeadId", () => {
    triggerOutboundSync({ tenantId: "t1", crmLeadId: "lead-1" });
    expect(h.enqueue).toHaveBeenCalledWith({ tenantId: "t1", crmLeadId: "lead-1" });
  });

  it("is fire-and-forget: returns void and never blocks the caller", () => {
    // Redis-down reality: enqueueLeadSquaredSyncSafe no-ops and resolves null;
    // it never rejects (its own error-swallowing is covered in sync-queue.test).
    h.enqueue.mockResolvedValue(null);
    expect(triggerOutboundSync({ tenantId: "t1", crmLeadId: "lead-1" })).toBeUndefined();
  });
});
