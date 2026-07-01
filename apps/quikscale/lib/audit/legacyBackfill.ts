/**
 * Generic pure mapper: a legacy `AuditLog` row → new AuditEvent + AuditChange
 * shape. Parameterized by entityType + the entity's audit-field whitelist so
 * every module (Priority, WWW, …) shares one mapper. Per-entity wrappers
 * (priorityBackfill.ts, wwwBackfill.ts) pin the params.
 *
 * No Prisma, no I/O — fully unit-testable. The runners
 * (scripts/backfill-*-audit.ts) wrap DB reads/writes around this.
 *
 * Idempotency: produced AuditEvent.id reuses the source AuditLog.id (1:1),
 * AuditChange ids are `${logId}_c${n}` — so a re-run with
 * createMany({ skipDuplicates: true }) inserts nothing new.
 *
 * Caveat on historical UPDATEs: the legacy PUT routes stored only `newValues`
 * (no `oldValues`), so a backfilled UPDATE has no reconstructable field diff.
 * Those map to an UPDATE event carrying the post-state snapshot and zero change
 * rows; the panel renders them as an honest "historical edit" entry.
 */
import { diffFields } from "./diff";
import { classifyUpdateAction, type AuditAction } from "./actions";

export interface LegacyAuditLog {
  id: string;
  orgId: string;
  entityId: string;
  action: string;
  oldValues: string | null;
  newValues: string | null;
  actorId: string;
  reason: string | null;
  createdAt: Date | string;
}

export interface MappedAuditChange {
  id: string;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface MappedAuditEvent {
  id: string;
  orgId: string;
  teamId: string | null;
  entityType: string;
  entityId: string;
  action: AuditAction;
  actorUserId: string;
  actorName: string;
  source: "web" | "system" | "import";
  reason: string | null;
  snapshot: unknown;
  createdAt: Date;
}

export interface MapResult {
  event: MappedAuditEvent;
  changes: MappedAuditChange[];
}

export interface MapContext {
  /** Resolved "First Last" for the log's actorId (or "—"). */
  actorName: string;
}

export interface LegacyMapOptions {
  /** entityType to write on the new event (e.g. "PRIORITY", "WWW"). */
  entityType: string;
  /** Whitelist of fields to diff on UPDATE (the entity's AUDIT_FIELDS). */
  auditFields: string[];
}

function safeParse(json: string | null | undefined): Record<string, unknown> | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * True for legacy aggregate rows that don't map to a single entity — the old
 * bulk-restore wrote `entityId = ids.join(",")`. Runners skip these (each
 * entity gets its own RESTORE event going forward).
 */
export function isAggregateLog(log: LegacyAuditLog): boolean {
  return log.entityId.includes(",");
}

/** Map one legacy AuditLog row to a new event + its field-change rows. */
export function mapLegacyAuditLog(
  log: LegacyAuditLog,
  ctx: MapContext,
  opts: LegacyMapOptions,
): MapResult {
  const before = safeParse(log.oldValues);
  const after = safeParse(log.newValues);
  const createdAt = typeof log.createdAt === "string" ? new Date(log.createdAt) : log.createdAt;
  const teamId =
    (after?.teamId as string | null | undefined) ??
    (before?.teamId as string | null | undefined) ??
    null;

  const base = {
    id: log.id,
    orgId: log.orgId,
    teamId,
    entityType: opts.entityType,
    entityId: log.entityId,
    actorUserId: log.actorId,
    actorName: ctx.actorName,
    reason: log.reason ?? null,
    createdAt,
    source: "web" as const,
  };

  switch (log.action) {
    case "CREATE":
      return { event: { ...base, action: "CREATE", snapshot: after ?? null }, changes: [] };

    case "DELETE":
      return { event: { ...base, action: "DELETE", snapshot: before ?? null }, changes: [] };

    case "RESTORE":
      return { event: { ...base, action: "RESTORE", snapshot: after ?? null }, changes: [] };

    case "UPDATE": {
      // Legacy stored only newValues → no reconstructable diff. Keep the
      // post-state snapshot so the event survives the empty-UPDATE prune and
      // renders as a "historical edit".
      const diffs = before
        ? diffFields(before, after ?? {}, { include: opts.auditFields })
        : [];
      const action = classifyUpdateAction(diffs.map((d) => d.fieldName));
      return {
        event: { ...base, action, snapshot: diffs.length ? null : (after ?? null) },
        changes: diffs.map((d, i) => ({
          id: `${log.id}_c${i}`,
          fieldName: d.fieldName,
          oldValue: d.oldValue,
          newValue: d.newValue,
        })),
      };
    }

    default:
      // Unknown legacy action — preserve both blobs in the snapshot for forensics.
      return {
        event: {
          ...base,
          action: "UPDATE",
          snapshot: { legacyAction: log.action, oldValue: before, newValue: after },
        },
        changes: [],
      };
  }
}
