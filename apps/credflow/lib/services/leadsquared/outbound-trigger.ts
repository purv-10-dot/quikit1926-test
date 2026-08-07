import { enqueueLeadSquaredSyncSafe } from "@/lib/queue/leadsquared-queue";

/**
 * Fire the outbound LeadSquared push for a just-committed CRM-origin lead
 * change. THE single trigger used by every CRM-side write path (create/update
 * services + the direct-prisma update paths that bypass them).
 *
 * Contract:
 *  - Call AFTER the lead row is committed. For a `$transaction`, call AFTER the
 *    tx resolves — never inside it (a rollback must not leave a queued push).
 *  - Fire-and-forget + Redis-safe: `enqueueLeadSquaredSyncSafe` swallows its own
 *    errors and no-ops without Redis, so this never blocks or throws into the
 *    caller. We still guard with a catch as belt-and-suspenders.
 *  - origin is always 'crm' (hardcoded inside the queue). The inbound webhook
 *    path (origin='leadsquared') must NOT call this — it would re-loop.
 *  - Redundant enqueues are cheap: the loop guard drops an unchanged payload, so
 *    a change to a non-synced field (e.g. owner) is a no-op at push time.
 */
export function triggerOutboundSync(input: { orgId: string; crmLeadId: string }): void {
  void enqueueLeadSquaredSyncSafe(input).catch((err) =>
    console.error("[leadsquared] enqueue failed", err instanceof Error ? err.message : err),
  );
}
