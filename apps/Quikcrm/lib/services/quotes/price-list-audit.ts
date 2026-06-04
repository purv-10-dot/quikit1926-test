import type { Prisma } from "@quikit/database";
import { db } from "@/lib/db";

type DbClient = typeof db | Prisma.TransactionClient;

export type PriceListAuditAction =
  | "list_created"
  | "list_updated"
  | "list_deleted"
  | "list_restored"
  | "list_duplicated"
  | "item_added"
  | "item_updated"
  | "item_deleted"
  | "item_restored"
  | "items_imported"
  | "items_bulk_updated";

export async function logPriceListAudit(args: {
  orgId: string;
  priceListId: string;
  itemId?: string | null;
  action: PriceListAuditAction;
  summary: string;
  changes?: Record<string, { from?: unknown; to?: unknown }> | null;
  userId?: string | null;
  userName?: string | null;
  tx?: DbClient;
}): Promise<void> {
  const client = args.tx ?? db;
  const changes =
    args.changes == null
      ? undefined
      : (args.changes as unknown as Prisma.InputJsonValue);
  await client.crmPriceListAuditLog.create({
    data: {
      orgId: args.orgId,
      priceListId: args.priceListId,
      itemId: args.itemId ?? null,
      action: args.action,
      summary: args.summary,
      changes,
      userId: args.userId ?? null,
      userName: args.userName ?? null,
    },
  });
}

export async function listPriceListAudit(args: {
  orgId: string;
  priceListId: string;
  page: number;
  pageSize: number;
}) {
  const where = { orgId: args.orgId, priceListId: args.priceListId };
  const [items, total] = await Promise.all([
    db.crmPriceListAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (args.page - 1) * args.pageSize,
      take: args.pageSize,
    }),
    db.crmPriceListAuditLog.count({ where }),
  ]);
  return {
    items,
    total,
    page: args.page,
    pageSize: args.pageSize,
    totalPages: Math.max(1, Math.ceil(total / args.pageSize)),
  };
}
