import { getRedis, isRedisEnabled } from "@/lib/db/redis";

/**
 * Realtime lead-change events. Published by write routes after commit, consumed
 * by the SSE endpoint and forwarded to subscribed kanban clients in the same
 * tenant. The channel is namespaced per-tenant so cross-tenant leakage is
 * impossible at the pub/sub layer.
 */
export type LeadEvent =
  | { type: "created"; leadId: string; stage: string }
  | { type: "updated"; leadId: string; stage: string }
  | { type: "transitioned"; leadId: string; stage: string; fromStage: string }
  | { type: "deleted"; leadId: string };

export function tenantLeadChannel(orgId: string): string {
  return `quikcrm:leads:${orgId}`;
}

let warnedDown = false;

/**
 * Fire-and-forget publish. No-op when Redis is disabled (matches the trigger
 * pattern in lib/services/automation/triggers.ts so the rest of the CRM stays
 * functional in environments without Redis).
 */
export async function publishLeadEvent(orgId: string, event: LeadEvent): Promise<void> {
  if (!isRedisEnabled()) return;
  try {
    await getRedis().publish(tenantLeadChannel(orgId), JSON.stringify(event));
  } catch (err) {
    if (!warnedDown) {
      warnedDown = true;
      console.warn(
        "[realtime] publish failed — kanban clients may miss this event:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}
