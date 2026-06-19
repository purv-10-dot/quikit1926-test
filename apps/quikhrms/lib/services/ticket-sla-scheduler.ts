/**
 * Ticket SLA scheduling hooks.
 *
 * These previously enqueued per-ticket *delayed* BullMQ jobs (on the
 * `cron-tickets` queue) to fire at the SLA due time, plus hourly/daily sweeps.
 * That queue was removed to keep QuikHRMS off the shared Redis instance.
 *
 * SLA breach detection + auto-close now run on demand via the CRON_SECRET-guarded
 * HTTP endpoints (app/api/cron/tickets-sla-breach, tickets-auto-close →
 * lib/services/ticket-cron.ts), triggered by an external scheduler when Help Desk
 * SLA is in use. These remain as no-ops so the ticket routes that call them
 * (tickets/route.ts, tickets/[id]/route.ts, tickets/[id]/comments/route.ts)
 * keep working without touching Redis.
 */

export type SlaKind = "response" | "resolve";

/** No-op — per-ticket SLA jobs removed (breach detection via the HTTP sweep). */
export async function scheduleSlaCheck(
  _orgId: string,
  _ticketId: string,
  _kind: SlaKind,
  _dueAt: Date | null,
): Promise<void> {
  // intentionally a no-op
}

/** No-op — see scheduleSlaCheck. */
export async function cancelSlaCheck(_ticketId: string, _kind: SlaKind): Promise<void> {
  // intentionally a no-op
}
