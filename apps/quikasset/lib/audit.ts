import { db } from "@/lib/db";

interface AuditParams {
  orgId: string;
  module: string;
  action: string;
  entityId: string;
  entityName: string;
  details?: string;
  actorId?: string | null;
  actorEmail?: string | null;
}

/**
 * Append-only audit write. Tenant-scoped. Never throws — audit failures must
 * not break the calling operation.
 */
export async function audit(params: AuditParams): Promise<void> {
  try {
    await db.astAuditLog.create({
      data: {
        orgId: params.orgId,
        module: params.module,
        action: params.action,
        entityId: params.entityId,
        entityName: params.entityName,
        details: params.details ?? null,
        actorId: params.actorId ?? null,
        actorEmail: params.actorEmail ?? null,
      },
    });
  } catch {
    // swallow — auditing is best-effort
  }
}
