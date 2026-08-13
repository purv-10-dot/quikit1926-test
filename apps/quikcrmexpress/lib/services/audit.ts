/**
 * Audit log writer.
 *
 * Writes an entry to the AuditLog table. Always called inside the same Prisma
 * transaction as the change being audited so that a write failure rolls back
 * the audit row too.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

type AnyTx = Prisma.TransactionClient | PrismaClient;

export interface AuditOptions {
  orgId: string;
  userId?: string | null;
  module: string;
  action: "create" | "update" | "delete" | "bulk_update" | string;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown> | null;
}

export async function audit(opts: AuditOptions, tx: AnyTx = prisma): Promise<void> {
  await tx.qceAuditLog.create({
    data: {
      orgId: opts.orgId,
      userId: opts.userId ?? null,
      module: opts.module,
      action: opts.action,
      resourceId: opts.resourceId ?? null,
      before: opts.before == null ? undefined : (opts.before as Prisma.InputJsonValue),
      after: opts.after == null ? undefined : (opts.after as Prisma.InputJsonValue),
      metadata: opts.metadata == null ? undefined : (opts.metadata as Prisma.InputJsonValue),
    },
  });
}

/**
 * Diffing helper: returns shallow before/after objects containing only changed
 * top-level keys. Use to keep audit entries small and focused on the diff.
 */
export function diffShallow<T extends Record<string, unknown>>(
  before: T,
  after: T,
): { before: Partial<T>; after: Partial<T> } {
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      b[k as keyof T] = before[k as keyof T];
      a[k as keyof T] = after[k as keyof T];
    }
  }
  return { before: b, after: a };
}
