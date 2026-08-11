import { describe, expect, it, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import type { Job } from "bullmq";
import type { QcfLead, PrismaClient } from "@quikit/database";
import { processLeadSquaredSyncJob } from "@/lib/services/leadsquared/sync-job";
import type { LeadSquaredSyncJobData } from "@/lib/queue/leadsquared-queue";
import type { syncLeadOutbound } from "@/lib/services/leadsquared/outbound";
import { DEFAULT_FIELD_MAP_CONFIG } from "@/lib/services/leadsquared/field-map";

const TENANT = "tenant-1";
const LEAD_ID = "lead-1";

function job(
  data: Partial<LeadSquaredSyncJobData> = {},
): Job<LeadSquaredSyncJobData> {
  return {
    data: { orgId: TENANT, crmLeadId: LEAD_ID, origin: "crm", ...data },
  } as unknown as Job<LeadSquaredSyncJobData>;
}

/** Build a QcfLead-shaped stub from a partial (narrowed through unknown, no `as any`). */
function leadRow(partial: Partial<QcfLead>): QcfLead {
  return { id: LEAD_ID, orgId: TENANT, name: "Ada", deletedAt: null, ...partial } as unknown as QcfLead;
}

function setup() {
  const db = mockDeep<PrismaClient>();
  const sync = vi.fn().mockResolvedValue({ pushed: true, prospectId: "PID-1" });
  const client = { createOrUpdateLead: vi.fn() };
  const resolveClient = vi.fn().mockReturnValue(client);
  const lock = vi.fn((_key: string, fn: () => Promise<unknown>) => fn()); // pass-through
  const deps = {
    prisma: db as unknown as PrismaClient,
    sync: sync as unknown as typeof syncLeadOutbound,
    resolveClient,
    lock: lock as unknown as <T>(key: string, fn: () => Promise<T>) => Promise<T>,
    resolveFieldMap: async () => DEFAULT_FIELD_MAP_CONFIG,
  };
  return { db, sync, client, resolveClient, lock, deps };
}

describe("processLeadSquaredSyncJob", () => {
  it("re-reads the lead (tenant-scoped) and forwards args to syncLeadOutbound", async () => {
    const { db, sync, client, resolveClient, deps } = setup();
    const lead = leadRow({ name: "Ada" });
    db.qcfLead.findFirst.mockResolvedValue(lead);

    await processLeadSquaredSyncJob(job(), deps);

    expect(db.qcfLead.findFirst).toHaveBeenCalledWith({
      where: { id: LEAD_ID, orgId: TENANT },
    });
    expect(resolveClient).toHaveBeenCalledWith(TENANT);
    expect(sync).toHaveBeenCalledWith(
      { orgId: TENANT, crmLeadId: LEAD_ID, lead, origin: "crm" },
      { client, fieldMap: DEFAULT_FIELD_MAP_CONFIG },
    );
  });

  it("serializes work under a per-lead lock keyed by tenant+lead", async () => {
    const { db, lock, deps } = setup();
    db.qcfLead.findFirst.mockResolvedValue(leadRow({ id: LEAD_ID }));

    await processLeadSquaredSyncJob(job(), deps);

    expect(lock).toHaveBeenCalledWith(`${TENANT}:${LEAD_ID}`, expect.any(Function));
  });

  it("skips a missing lead without calling syncLeadOutbound", async () => {
    const { db, sync, deps } = setup();
    db.qcfLead.findFirst.mockResolvedValue(null);

    await processLeadSquaredSyncJob(job(), deps);

    expect(sync).not.toHaveBeenCalled();
  });

  it("skips a soft-deleted lead", async () => {
    const { db, sync, deps } = setup();
    db.qcfLead.findFirst.mockResolvedValue(leadRow({ deletedAt: new Date() }));

    await processLeadSquaredSyncJob(job(), deps);

    expect(sync).not.toHaveBeenCalled();
  });

  it("propagates the job's origin (always 'crm' from this queue)", async () => {
    const { db, sync, deps } = setup();
    db.qcfLead.findFirst.mockResolvedValue(leadRow({}));

    await processLeadSquaredSyncJob(job(), deps);

    expect(sync.mock.calls[0][0]).toMatchObject({ origin: "crm" });
  });
});
