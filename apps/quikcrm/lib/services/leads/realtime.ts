/**
 * Realtime lead-change events.
 *
 * Redis-backed pub/sub has been removed from the leads board — the kanban now
 * refreshes via polling instead of SSE. `publishLeadEvent` is kept as a no-op
 * so the write routes / transition service that call it need no changes.
 */
export type LeadEvent =
  | { type: "created"; leadId: string; stage: string }
  | { type: "updated"; leadId: string; stage: string }
  | { type: "transitioned"; leadId: string; stage: string; fromStage: string }
  | { type: "deleted"; leadId: string };

export function tenantLeadChannel(orgId: string): string {
  return `quikcrm:leads:${orgId}`;
}

/**
 * No-op. Previously published a lead-change event to Redis for SSE fan-out;
 * the leads board now relies on polling, so there is nothing to publish.
 * Kept (and still fire-and-forget) so existing callers require no changes.
 */
export async function publishLeadEvent(
  _orgId: string,
  _event: LeadEvent,
): Promise<void> {
  return;
}
