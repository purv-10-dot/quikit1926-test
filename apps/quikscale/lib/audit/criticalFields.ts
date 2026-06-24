/**
 * Shared constants + pure helpers for Critical # / Balancing Critical # audit
 * logging (OPSP Critical Hash Review).
 *
 * Kept JSX-free so it can be imported by the API route, the client timeline
 * hook, the audit config, and unit tests without pulling in React.
 *
 * The Critical Review reuses the rich `AuditEvent`/`AuditChange` system (the
 * same one KPI/Priority/WWW use), keyed by a composite entityId so each of the
 * 6 cards (3 modules × 2 card types) — and each per-user Individual card — owns
 * its own timeline:
 *
 *   entityType = "CRITICAL_REVIEW"
 *   entityId   = `${opspId}:${period}`
 *   period     = `${module}:${cardType}`                 (year / actions)
 *              = `people:${cardType}:${subjectUserId}`   (per-user Individual)
 */

/** Stored AuditEvent.entityType for Critical # Review cards. */
export const CRITICAL_AUDIT_ENTITY_TYPE = "CRITICAL_REVIEW";

export type CriticalModule = "actions" | "year" | "people";
export type CriticalCardType = "critical" | "balancing";

/** Internal module key → user-facing scope label (matches the sub-tabs). */
export const MODULE_LABELS: Record<string, string> = {
  year: "Year",
  actions: "Quarter",
  people: "Individual",
};

/** Card type → user-facing label. */
export const CARD_LABELS: Record<string, string> = {
  critical: "Critical #",
  balancing: "Balancing Critical #",
};

/**
 * The `period` segment of a Critical card's audit key. Individual (`people`)
 * cards are scoped per subject so each user owns their own timeline; org-level
 * Year/Quarter cards are shared.
 */
export function criticalPeriod(
  module: string,
  cardType: string,
  subjectUserId?: string | null,
): string {
  return module === "people"
    ? `people:${cardType}:${subjectUserId ?? ""}`
    : `${module}:${cardType}`;
}

/** Composite AuditEvent.entityId for a Critical card. */
export function criticalEntityId(
  opspId: string,
  module: string,
  cardType: string,
  subjectUserId?: string | null,
): string {
  return `${opspId}:${criticalPeriod(module, cardType, subjectUserId)}`;
}

export interface ParsedCriticalEntityId {
  opspId: string;
  module: string;
  cardType: string;
  /** Present only for `people` cards. */
  subjectUserId: string | null;
}

/**
 * Inverse of `criticalEntityId`. Returns `null` when the id is malformed.
 * `opspId` is a cuid (no colons), so the first colon splits opspId from period.
 */
export function parseCriticalEntityId(entityId: string): ParsedCriticalEntityId | null {
  const sep = entityId.indexOf(":");
  if (sep < 0) return null;
  const opspId = entityId.slice(0, sep);
  const period = entityId.slice(sep + 1);
  if (!opspId || !period) return null;

  const parts = period.split(":");
  const module = parts[0] ?? "";
  if (module === "people") {
    const cardType = parts[1] ?? "";
    const subjectUserId = parts[2] ?? "";
    if (!cardType || !subjectUserId) return null;
    return { opspId, module, cardType, subjectUserId };
  }
  if (module === "year" || module === "actions") {
    const cardType = parts[1] ?? "";
    if (!cardType) return null;
    return { opspId, module, cardType, subjectUserId: null };
  }
  return null;
}

/** Human label for a Critical audit field (drives the diff rows). */
export function criticalFieldLabel(field: string): string {
  switch (field) {
    case "achievedValue":
      return "Achieved";
    case "comment":
      return "Comment";
    case "category":
      return "Title";
    default:
      return field;
  }
}

/** "Individual · Critical #" style scope label for the panel header chip. */
export function criticalScopeLabel(module: string, cardType: string): string {
  const m = MODULE_LABELS[module] ?? module;
  const c = CARD_LABELS[cardType] ?? cardType;
  return `${m} · ${c}`;
}
