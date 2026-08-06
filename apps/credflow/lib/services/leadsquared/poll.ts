/**
 * Inbound POLLER (safety net) for LeadSquared → QuikCRM.
 *
 * LeadSquared only fires our webhook on `Lead_Post_Create`; stage/status CHANGES
 * (manual or automation-driven) do NOT emit a webhook. This poller closes that
 * gap: on an interval (see the worker) it PULLS leads modified since the last
 * run and feeds each through the SAME inbound path as the webhook
 * (`processInboundBatch` → extract → loop-guard → idempotent upsert). So it is:
 *   - loop-safe: inbound never enqueues outbound (structural guard), and the
 *     cross-direction hash echo-skips anything unchanged / our own pushes;
 *   - idempotent: a lead already synced by the create-webhook is a no-op;
 *   - tenant-scoped: single-client, resolved from env like the webhook route.
 *
 * A Redis watermark (last successful `to`) bounds each window; on a fetch error
 * we DON'T advance it, so the next run retries the missed window.
 */
import { getRedis } from "@/lib/db/redis";
import { LeadSquaredClient } from "@/lib/services/leadsquared/client";
import { processInboundBatch, resolveInboundTenantId } from "@/lib/services/leadsquared/inbound";
import { getResolvedFieldMap } from "@/lib/services/leadsquared/field-map-resolver";
import type { LeadSquaredFieldMapConfig } from "@/lib/services/leadsquared/field-map";
import { incr, logSync } from "@/lib/services/leadsquared/telemetry";

const WATERMARK_PREFIX = "leadsquared:poll:watermark:";

async function defaultGetWatermark(tenantId: string): Promise<Date | null> {
  const v = await getRedis().get(`${WATERMARK_PREFIX}${tenantId}`);
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

async function defaultSetWatermark(tenantId: string, at: Date): Promise<void> {
  await getRedis().set(`${WATERMARK_PREFIX}${tenantId}`, at.toISOString());
}

export interface PollDeps {
  client?: Pick<LeadSquaredClient, "getRecentlyModifiedLeads">;
  processBatch?: typeof processInboundBatch;
  resolveTenant?: () => string;
  resolveFieldMap?: () => Promise<LeadSquaredFieldMapConfig>;
  getWatermark?: (tenantId: string) => Promise<Date | null>;
  setWatermark?: (tenantId: string, at: Date) => Promise<void>;
  now?: () => Date;
  /** First-run look-back when no watermark exists (default 10 min). */
  windowMs?: number;
  /** Re-scan overlap before the watermark, to avoid boundary misses (default 2 min). */
  overlapMs?: number;
}

export interface PollResult {
  tenantId: string;
  from: Date;
  to: Date;
  fetched: number;
  applied: number;
}

/**
 * Run one poll cycle. Throws only if the FETCH fails (so the caller can log and
 * the watermark stays put for a retry); a per-record processing error is
 * swallowed inside `processInboundBatch` and never fails the whole cycle.
 */
export async function pollLeadSquaredInbound(deps: PollDeps = {}): Promise<PollResult> {
  const client = deps.client ?? LeadSquaredClient.fromEnv();
  const processBatch = deps.processBatch ?? processInboundBatch;
  const resolveTenant = deps.resolveTenant ?? resolveInboundTenantId;
  const resolveFieldMap = deps.resolveFieldMap ?? getResolvedFieldMap;
  const getWatermark = deps.getWatermark ?? defaultGetWatermark;
  const setWatermark = deps.setWatermark ?? defaultSetWatermark;
  const now = deps.now ?? (() => new Date());
  const windowMs = deps.windowMs ?? Number(process.env.LEADSQUARED_POLL_WINDOW_MS ?? 600_000);
  const overlapMs = deps.overlapMs ?? Number(process.env.LEADSQUARED_POLL_OVERLAP_MS ?? 120_000);

  const tenantId = resolveTenant();
  const to = now();
  const last = await getWatermark(tenantId);
  const from = last ? new Date(last.getTime() - overlapMs) : new Date(to.getTime() - windowMs);

  // Fetch FIRST. If this throws we never advance the watermark → next run retries.
  const leads = await client.getRecentlyModifiedLeads(from, to);

  let applied = 0;
  if (leads.length > 0) {
    const fieldMap = await resolveFieldMap();
    const results = await processBatch(tenantId, leads, { fieldMap });
    applied = results.filter((r) => r.action === "created" || r.action === "updated").length;
  }

  await setWatermark(tenantId, to);
  logSync("info", "poll.completed", {
    tenantId,
    from: from.toISOString(),
    to: to.toISOString(),
    fetched: leads.length,
    applied,
  });
  incr("poll.completed");
  return { tenantId, from, to, fetched: leads.length, applied };
}
