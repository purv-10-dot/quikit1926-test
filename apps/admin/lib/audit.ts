import { db } from "@/lib/db";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "INVITED"
  | "RESENT"
  | "REVOKED"
  | "ACCEPTED"
  | "DUPLICATE_INVITE";

export type AuditEntityType = "Membership" | "Invitation" | "User" | "Tenant";

export interface AuditLogInput {
  tenantId: string;
  actorId: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  oldValues?: unknown;
  newValues?: unknown;
  reason?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

function safeStringify(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  try {
    return JSON.stringify(v);
  } catch {
    return undefined;
  }
}

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        oldValues: safeStringify(input.oldValues),
        newValues: safeStringify(input.newValues),
        changes: [],
        reason: input.reason ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[writeAuditLog] failed:", error);
  }
}
