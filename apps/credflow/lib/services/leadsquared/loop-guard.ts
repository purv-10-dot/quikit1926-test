/**
 * Loop guard for the QuikCRM <-> LeadSquared two-way sync.
 *
 * The defining risk of any bidirectional sync is the echo loop:
 *
 *   CRM write -> push to LSQ -> LSQ fires webhook -> write to CRM
 *             -> push to LSQ -> ... (forever)
 *
 * Two pieces of state on `LeadSquaredSyncMap` stop this, and this module is the
 * single place that reasons about them. It is pure (no network, no Prisma) so
 * it is trivially unit-testable and can be called from both the outbound push
 * and the inbound webhook paths.
 *
 *   - `syncOrigin`      — which system authored the write we are looking at.
 *   - `lastPayloadHash` — a stable hash of the field set we last synced.
 *
 * The two guards below combine those into a simple, symmetric rule:
 *   1. Never push a change back to the system it came from.
 *   2. Never act on a payload identical to the one we last synced (an echo).
 */
import { createHash } from "crypto";

/** Which system authored a given write. Mirrors `LeadSquaredSyncMap.syncOrigin`. */
export type SyncOrigin = "crm" | "leadsquared";

/**
 * Stable, order-independent JSON serialisation.
 *
 * `JSON.stringify` preserves insertion order, so two payloads with the same
 * fields in a different order would hash differently and defeat the echo check.
 * We recursively sort object keys so the hash depends only on content. Arrays
 * keep their order (order is meaningful for arrays); primitives pass through.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableStringify(
          (value as Record<string, unknown>)[key],
        )}`,
    );
  return `{${entries.join(",")}}`;
}

/**
 * Stable sha256 (hex) of a sync payload. Given equal content, always returns
 * the same hash regardless of key ordering. This is what we persist as
 * `lastPayloadHash` and compare against on the next event.
 */
export function hashPayload(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

export interface ShouldPushArgs {
  /** Which system authored the change being considered for push. */
  origin: SyncOrigin;
  /** Hash of the payload we are about to push. */
  newHash: string;
  /** Hash we last synced for this lead (`null` if never synced). */
  lastHash: string | null | undefined;
}

/**
 * Decide whether a CRM change should be pushed OUT to LeadSquared.
 *
 * Returns false when:
 *   - the change originated in LeadSquared (pushing it back would echo), or
 *   - the payload is unchanged from what we last synced (nothing to send).
 */
export function shouldPushToLeadSquared({
  origin,
  newHash,
  lastHash,
}: ShouldPushArgs): boolean {
  if (origin === "leadsquared") return false;
  return newHash !== lastHash;
}

export interface ShouldApplyInboundArgs {
  /** Hash of the payload just received from LeadSquared. */
  newHash: string;
  /** Hash we last synced for this lead (`null` if never synced). */
  lastHash: string | null | undefined;
  /**
   * Which system authored the write the stored hash represents. Origin-aware by
   * design: a DIFFERENT hash is always a real change and is applied regardless
   * of origin — so an inbound update is never suppressed merely because an
   * OUTBOUND ('crm') push previously stored a hash for this lead. A MATCHING
   * hash is a no-op either way: the echo of our own 'crm' push, or a duplicate
   * 'leadsquared' delivery. Optional; only affects intent/telemetry, never the
   * "is this a real change" decision, which is content-based.
   */
  lastOrigin?: SyncOrigin | null;
}

/**
 * Decide whether an inbound LeadSquared webhook payload should be applied to
 * QuikCRM.
 *
 * A genuinely different payload (hash mismatch) is ALWAYS applied — regardless
 * of whether the stored hash was last written by an outbound 'crm' push or a
 * prior inbound 'leadsquared' write. This is the guarantee that a real
 * LeadSquared stage/status change lands even on a lead outbound touched last.
 *
 * Returns false only when the incoming payload is byte-identical to what we last
 * synced: the echo of our own outbound push, or a duplicate webhook delivery.
 * Both are no-ops. (Change detection relies on a FAITHFUL hash — see
 * `buildLeadSquaredAttributes({ forHash: true })` — so stage/status values
 * outside the picklist allowlist still move the hash and are not lost here.)
 */
export function shouldApplyInbound({
  newHash,
  lastHash,
  lastOrigin: _lastOrigin,
}: ShouldApplyInboundArgs): boolean {
  return newHash !== lastHash;
}
