/**
 * Centralized AuditLog writer.
 *
 * Writes to the AuditLog table that's defined in the Prisma schema but was
 * previously unused. Every mutation route should call this once it's done
 * applying its changes, regardless of whether the entity has its own
 * domain-specific log (e.g. KPILog continues to exist for KPI-specific
 * audit trails; AuditLog is the cross-entity log for compliance).
 *
 * Usage:
 *   await writeAuditLog({
 *     tenantId,
 *     actorId: session.user.id,
 *     action: "CREATE",
 *     entityType: "Priority",
 *     entityId: newPriority.id,
 *     newValues: newPriority,
 *   });
 *
 * Failures are caught and logged to console but never bubble up — an audit
 * write failure should NEVER block the primary mutation. If you need
 * stronger guarantees, move to an outbox pattern.
 */
import { db } from "@/lib/db";

export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "RESTORE";

export type AuditEntityType =
  | "Team"
  | "Priority"
  | "WWWItem"
  | "KPI"
  | "Meeting"
  | "User"
  | "Membership"
  | "OPSPData"
  | "Quarter"
  | "Category"
  | "DailyHuddle"
  | "Review"
  | "Impersonation";

export interface AuditLogInput {
  tenantId: string;
  actorId: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  oldValues?: unknown;
  newValues?: unknown;
  /** Which top-level fields changed (populated from oldValues/newValues diff) */
  changes?: string[];
  reason?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** Optional role of the actor at mutation time (from membership) */
  actorRole?: string | null;
}

/**
 * Compute a flat list of changed top-level keys between two objects.
 * Used when the caller doesn't provide an explicit `changes` array.
 */
function diffKeys(oldValues: unknown, newValues: unknown): string[] {
  if (!oldValues || !newValues) return [];
  if (typeof oldValues !== "object" || typeof newValues !== "object") return [];
  const o = oldValues as Record<string, unknown>;
  const n = newValues as Record<string, unknown>;
  const keys = new Set([...Object.keys(o), ...Object.keys(n)]);
  const changed: string[] = [];
  for (const k of keys) {
    // Shallow JSON-stringify comparison catches scalar + nested-object cases
    if (JSON.stringify(o[k]) !== JSON.stringify(n[k])) changed.push(k);
  }
  return changed;
}

function safeStringify(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  try {
    const changes = input.changes ?? diffKeys(input.oldValues, input.newValues);
    await db.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.actorId,
        actorRole: input.actorRole ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        oldValues: safeStringify(input.oldValues),
        newValues: safeStringify(input.newValues),
        changes,
        reason: input.reason ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (error) {
    // Never bubble audit failures. Log and move on so the primary mutation
    // response isn't affected by a compliance-log glitch.
    // eslint-disable-next-line no-console
    console.error("[writeAuditLog] failed:", error);
  }
}
