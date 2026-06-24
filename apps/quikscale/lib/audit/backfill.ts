/**
 * Pure mapper: legacy KPILog row → new AuditEvent + AuditChange shape.
 *
 * No Prisma, no I/O — so the mapping is fully unit-testable. The runner
 * (scripts/backfill-kpilog-audit.ts) wraps DB reads/writes around this.
 *
 * Idempotency: the produced AuditEvent.id reuses the source KPILog.id (1:1),
 * and AuditChange ids are `${logId}_c${n}` — so a re-run with
 * createMany({ skipDuplicates: true }) inserts nothing new.
 */
import { diffFields } from "./diff";
import { classifyUpdateAction, type AuditAction } from "./actions";
import { KPI_AUDIT_FIELDS } from "./kpiFields";

export interface LegacyKpiLog {
  id: string;
  orgId: string;
  kpiId: string;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
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
  entityType: "KPI";
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
  /** Resolved "First Last" for the log's changedBy (or "—"). */
  actorName: string;
  /** The KPI's team, if resolvable. */
  teamId: string | null;
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

/** Map one legacy KPILog row to a new event + its field-change rows. */
export function mapKpiLog(log: LegacyKpiLog, ctx: MapContext): MapResult {
  const before = safeParse(log.oldValue);
  const after = safeParse(log.newValue);
  const createdAt = typeof log.createdAt === "string" ? new Date(log.createdAt) : log.createdAt;

  const isSystem =
    (after != null && "linkedFromTeamKPI" in after) ||
    (before != null && "cascadedFromTeamKPI" in before);
  const source: "web" | "system" = isSystem ? "system" : "web";

  const base = {
    id: log.id,
    orgId: log.orgId,
    teamId: ctx.teamId,
    entityType: "KPI" as const,
    entityId: log.kpiId,
    actorUserId: log.changedBy,
    actorName: ctx.actorName,
    reason: log.reason ?? null,
    createdAt,
    source,
  };

  switch (log.action) {
    case "CREATE":
      return { event: { ...base, action: "CREATE", snapshot: after ?? null }, changes: [] };

    case "DELETE":
      return { event: { ...base, action: "DELETE", snapshot: before ?? null }, changes: [] };

    case "UPDATE": {
      const diffs = diffFields(before ?? {}, after ?? {}, { include: KPI_AUDIT_FIELDS });
      const action = classifyUpdateAction(diffs.map((d) => d.fieldName));
      return {
        event: { ...base, action, snapshot: null },
        changes: diffs.map((d, i) => ({
          id: `${log.id}_c${i}`,
          fieldName: d.fieldName,
          oldValue: d.oldValue,
          newValue: d.newValue,
        })),
      };
    }

    case "UPDATE_WEEKLY": {
      const wv = after ?? {};
      const weekNumber = typeof wv.weekNumber === "number" ? wv.weekNumber : null;
      const value = (wv.value as number | null | undefined) ?? null;
      const snapshot = {
        weekNumber,
        value,
        notes: (wv.notes as string | null | undefined) ?? null,
        userId: (wv.userId as string | null | undefined) ?? null,
        // Prior values weren't captured by the legacy system.
        previousValue: null,
        priorWeekValue: null,
      };
      const changes =
        weekNumber != null
          ? [{ id: `${log.id}_c0`, fieldName: `week_${weekNumber}`, oldValue: null, newValue: value }]
          : [];
      return { event: { ...base, action: "WEEKLY_UPDATE", snapshot }, changes };
    }

    case "UPDATE_WEEKLY_BATCH": {
      const b = after ?? {};
      const results = Array.isArray(b.results) ? (b.results as Array<Record<string, unknown>>) : [];
      const okRows = results.filter((r) => r && r.ok !== false);
      const weeks = [
        ...new Set(okRows.map((r) => r.weekNumber).filter((w): w is number => typeof w === "number")),
      ].sort((a, c) => a - c);
      // Legacy didn't store per-row old/new, so rows carry nulls (no fake deltas).
      const rows = okRows.map((r) => ({
        weekNumber: r.weekNumber ?? null,
        userId: r.userId ?? null,
        oldValue: null,
        newValue: null,
        note: null,
      }));
      const snapshot = {
        applied: typeof b.applied === "number" ? b.applied : okRows.length,
        failed: typeof b.failed === "number" ? b.failed : 0,
        weeks,
        rows,
      };
      return { event: { ...base, action: "BULK_UPDATE", snapshot }, changes: [] };
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
