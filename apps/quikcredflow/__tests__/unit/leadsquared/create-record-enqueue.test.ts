import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import type { QcfLead, Prisma, PrismaClient } from "@quikit/database";

// Spies shared with the module mocks (hoisted so the vi.mock factories can use them).
const h = vi.hoisted(() => ({
  enqueue: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  logActivities: vi.fn(),
}));

vi.mock("@/lib/queue/leadsquared-queue", () => ({
  enqueueLeadSquaredSyncSafe: h.enqueue,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { qcfLead: { create: h.create, update: h.update } },
}));
vi.mock("@/lib/services/leads/log-lead-system-activities", () => ({
  logLeadSystemActivitiesOnCreate: h.logActivities,
}));

import { createCrmLead, updateCrmLead } from "@/lib/services/leads/create-record";
import { processInboundWebhook } from "@/lib/services/leadsquared/inbound";

const TENANT = "tenant-1";
const CREATE_DATA = { orgId: TENANT, name: "Ada" } as unknown as Prisma.QcfLeadUncheckedCreateInput;
const leadRow = (p: Partial<QcfLead> = {}): QcfLead =>
  ({ id: "lead-1", orgId: TENANT, name: "Ada", deletedAt: null, ...p }) as unknown as QcfLead;

beforeEach(() => {
  h.enqueue.mockReset().mockResolvedValue("job-1");
  h.create.mockReset();
  h.update.mockReset();
  h.logActivities.mockReset().mockResolvedValue(undefined);
});

describe("createCrmLead — outbound enqueue (the bug fix)", () => {
  it("enqueues once, right after the lead is committed", async () => {
    h.create.mockResolvedValue(leadRow({ id: "lead-new", orgId: TENANT }));

    const lead = await createCrmLead(CREATE_DATA);

    expect(lead.id).toBe("lead-new");
    expect(h.enqueue).toHaveBeenCalledTimes(1);
    expect(h.enqueue).toHaveBeenCalledWith({ orgId: TENANT, crmLeadId: "lead-new" });
  });

  it("STILL enqueues even when post-commit processing throws (the exact bug)", async () => {
    h.create.mockResolvedValue(leadRow({ id: "lead-new" }));
    // Simulate a throwable post-commit step (proxy for syncLeadScoreAfterChange /
    // recalculateLeadScore). The enqueue fires BEFORE this, so it must not be lost.
    h.logActivities.mockRejectedValue(new Error("scoring/log blew up"));

    const lead = await createCrmLead(CREATE_DATA);

    expect(lead.id).toBe("lead-new");
    expect(h.enqueue).toHaveBeenCalledTimes(1);
  });

  it("never lets an enqueue failure break lead creation", async () => {
    h.create.mockResolvedValue(leadRow({ id: "lead-new" }));
    h.enqueue.mockRejectedValue(new Error("redis down"));

    await expect(createCrmLead(CREATE_DATA)).resolves.toMatchObject({ id: "lead-new" });
  });
});

describe("updateCrmLead — outbound enqueue (PATCH path)", () => {
  it("enqueues once, using the updated row's tenant + id", async () => {
    h.update.mockResolvedValue(leadRow({ id: "lead-9", orgId: TENANT }));

    const updated = await updateCrmLead("lead-9", { stage: "Won" });

    expect(updated.id).toBe("lead-9");
    expect(h.enqueue).toHaveBeenCalledTimes(1);
    expect(h.enqueue).toHaveBeenCalledWith({ orgId: TENANT, crmLeadId: "lead-9" });
  });
});

describe("inbound webhook — must NOT enqueue (loop guard)", () => {
  it("processInboundWebhook writes the lead but never calls the outbound enqueue", async () => {
    const db = mockDeep<PrismaClient>();
    db.qcfLeadSquaredSyncMap.findFirst.mockResolvedValue(null);
    db.qcfLead.findUnique.mockResolvedValue(null);
    db.qcfLead.upsert.mockResolvedValue(leadRow({ id: "lead-inbound" }));

    await processInboundWebhook(
      TENANT,
      { ProspectID: "PID-1", EmailAddress: "a@b.co" },
      { prisma: db as unknown as PrismaClient },
    );

    // Inbound writes via the injected prisma directly — it does not go through
    // createCrmLead/updateCrmLead, so the CRM-origin enqueue never fires.
    expect(h.enqueue).not.toHaveBeenCalled();
  });
});
