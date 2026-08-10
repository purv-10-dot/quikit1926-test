/**
 * Worker-side processor for the `leadsquared-sync` queue.
 *
 * Runs in the BullMQ worker process (see lib/queue/worker.ts), never in the
 * request/response path. It re-reads the current QcfLead (tenant-scoped),
 * resolves a LeadSquared client, and delegates to `syncLeadOutbound`, which
 * runs the loop guard and performs the push + mapping upsert.
 */
import type { Job } from "bullmq";
import { prisma } from "@/lib/db/prisma";
import { LeadSquaredClient } from "@/lib/services/leadsquared/client";
import { syncLeadOutbound } from "@/lib/services/leadsquared/outbound";
import type { LeadSquaredSyncJobData } from "@/lib/queue/leadsquared-queue";
import { withLeadLock } from "@/lib/queue/lead-lock";
import { getResolvedFieldMap } from "@/lib/services/leadsquared/field-map-resolver";
import type { LeadSquaredFieldMapConfig } from "@/lib/services/leadsquared/field-map";

/**
 * Single choke point for credential resolution. Today it reads the process
 * env; when LeadSquared credentials become per-tenant, only this function
 * changes — the job and the outbound service stay untouched.
 */
export function resolveLeadSquaredClient(_tenantId: string): LeadSquaredClient {
  // TODO(leadsquared): resolve per-tenant credentials here (e.g. from a
  // QcfOrgWorkspaceSettings / secret store keyed by orgId) instead of the
  // single env-based client.
  return LeadSquaredClient.fromEnv();
}

export interface SyncJobDeps {
  prisma?: typeof prisma;
  sync?: typeof syncLeadOutbound;
  resolveClient?: (
    orgId: string,
  ) => Pick<LeadSquaredClient, "createOrUpdateLead" | "updateLead"> &
    Partial<Pick<LeadSquaredClient, "getLeadByEmail">>;
  /** Injectable per-lead lock (default: Redis advisory lock). Tests pass a pass-through. */
  lock?: <T>(key: string, fn: () => Promise<T>) => Promise<T>;
  /** Injectable field-map resolver (default: env + optional metadata, cached). */
  resolveFieldMap?: () => Promise<LeadSquaredFieldMapConfig>;
}

export async function processLeadSquaredSyncJob(
  job: Job<LeadSquaredSyncJobData>,
  deps: SyncJobDeps = {},
): Promise<void> {
  const db = deps.prisma ?? prisma;
  const runSync = deps.sync ?? syncLeadOutbound;
  const resolveClient = deps.resolveClient ?? resolveLeadSquaredClient;
  const lock = deps.lock ?? withLeadLock;
  const resolveFieldMap = deps.resolveFieldMap ?? getResolvedFieldMap;

  const { orgId, crmLeadId, origin } = job.data;

  // Serialize all sync work for this lead so concurrent pushes can't reorder at
  // the network layer and leave LeadSquared stale. Different leads stay parallel.
  await lock(`${orgId}:${crmLeadId}`, async () => {
    // Re-read the current lead, tenant-scoped. Skip soft-deleted / missing rows
    // (the lead may have been deleted between enqueue and processing).
    const lead = await db.qcfLead.findFirst({
      where: { id: crmLeadId, orgId },
    });
    if (!lead || lead.deletedAt) {
      console.warn(
        `[leadsquared] skip push: lead ${crmLeadId} (tenant ${orgId}) not found or deleted`,
      );
      return;
    }

    const client = resolveClient(orgId);
    const fieldMap = await resolveFieldMap();
    await runSync({ orgId, crmLeadId, lead, origin }, { client, fieldMap });
  });
}
