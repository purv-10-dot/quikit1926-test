/**
 * [P2.3] createCrmLead fires the New-Lead automation trigger at the SERVICE
 * layer (closes SURVEY #2 silent no-fire). Because BOTH the API route AND bulk
 * import (lead-import-row) call createCrmLead, this proves the import path now
 * fires rules — the acceptance's "import-path parity", verified by driving
 * createCrmLead directly.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDb } from "../../helpers/mockDb";
import type { QcfLead } from "@quikit/database";

vi.mock("@/lib/services/automation/triggers", () => ({
  onLeadCreated: vi.fn().mockResolvedValue(undefined),
  onLeadUpdated: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/services/leadsquared/outbound-trigger", () => ({ triggerOutboundSync: vi.fn() }));
vi.mock("@/lib/services/leads/log-lead-system-activities", () => ({
  logLeadSystemActivitiesOnCreate: vi.fn().mockResolvedValue(undefined),
}));

import { onLeadCreated } from "@/lib/services/automation/triggers";
import { triggerOutboundSync } from "@/lib/services/leadsquared/outbound-trigger";

const db = mockDb();

beforeEach(() => {
  vi.mocked(onLeadCreated).mockClear();
  vi.mocked(triggerOutboundSync).mockClear();
});

describe("createCrmLead · service-layer New-Lead trigger", () => {
  it("fires onLeadCreated AND the outbound sync (so the import path fires rules too)", async () => {
    db.qcfLead.create.mockResolvedValue({ id: "L1", orgId: "t1", ownerName: "Owner" } as unknown as QcfLead);

    const { createCrmLead } = await import("@/lib/services/leads/create-record");
    await createCrmLead({ orgId: "t1", name: "Imported Lead" } as never);

    expect(triggerOutboundSync).toHaveBeenCalledWith({ orgId: "t1", crmLeadId: "L1" });
    expect(onLeadCreated).toHaveBeenCalledTimes(1);
    expect(onLeadCreated).toHaveBeenCalledWith("t1", "L1", "Owner");
  });
});
