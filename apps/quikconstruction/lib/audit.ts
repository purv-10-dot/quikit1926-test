import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/**
 * Opt-in audit logger. Call from any write endpoint with the diff.
 * Non-throwing — audit failures never bubble up to break the caller.
 * Use Prisma's transaction client when inside a $transaction so the log
 * commits atomically with the business write.
 */
export async function logAudit(args: {
  tenantId: string;
  userId: string;
  actionType: "create" | "update" | "delete" | "status_change" | "post" | "approve" | "reject" | "finalize" | string;
  entityType: string;
  entityId: string;
  entityRef?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
  metadata?: unknown;
  tx?: Prisma.TransactionClient;
}): Promise<void> {
  const client = args.tx ?? db;
  try {
    await client.cnAuditLog.create({
      data: {
        tenantId: args.tenantId,
        userId: args.userId,
        actionType: args.actionType,
        entityType: args.entityType,
        entityId: args.entityId,
        entityRef: args.entityRef ?? null,
        oldValues: (args.oldValues as Prisma.InputJsonValue) ?? undefined,
        newValues: (args.newValues as Prisma.InputJsonValue) ?? undefined,
        metadata: (args.metadata as Prisma.InputJsonValue) ?? undefined,
      },
    });
  } catch (err) {
    // Never break callers on audit failures — log silently
    console.error("[audit] logAudit failed", err);
  }
}
