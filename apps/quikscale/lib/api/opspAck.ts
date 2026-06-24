/**
 * OPSP post-finalize "Mark as Reviewed" acknowledgement keys.
 *
 * The acknowledgement is a per-user high-water mark stored in the shared
 * `AuditEventRead` table (the same per-user read-marker the audit timelines
 * use) so it survives logout and is cross-device — unlike the previous
 * localStorage approach, which `globalSignOut()` wipes on every sign-out.
 *
 * One row per (user, surface, org+period): `lastReadAt` holds the timestamp of
 * the latest edit the user acknowledged. A highlight is due whenever a newer
 * edit exists (`latestEditTs > lastReadAt`).
 *
 * Pure (no DB / React) so the key derivation is unit-testable in isolation.
 */

export type OpspAckSurface = "form" | "review";

export function isOpspAckSurface(v: unknown): v is OpspAckSurface {
  return v === "form" || v === "review";
}

/**
 * `AuditEventRead.entityType` namespace for the ack — distinct per surface so
 * the OPSP Form and OPSP Review are acknowledged independently, and namespaced
 * (`OPSP_ACK_*`) so they never collide with audit-timeline read markers.
 */
export function opspAckEntityType(surface: OpspAckSurface): string {
  return surface === "review" ? "OPSP_ACK_REVIEW" : "OPSP_ACK_FORM";
}

/**
 * `AuditEventRead.entityId` for the ack. Includes `orgId` so the same user
 * acting in two orgs (e.g. via app-switch) never shares one period's mark.
 */
export function opspAckEntityId(orgId: string, year: number, quarter: string): string {
  return `${orgId}:${year}:${quarter}`;
}
