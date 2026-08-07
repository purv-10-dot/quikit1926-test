/**
 * Opportunity CRUD service.
 *
 * Centralises business rules so route handlers stay thin:
 *   - Server derives ownerName from public.User on every owner change
 *   - Server computes weightedAmount = amount * probability / 100 on every save
 *   - Soft delete is the default DELETE behaviour; restore reverses it
 *   - Owner change writes a QcfActivity audit row
 */
import type { QcfOpportunityStage, Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import { resolveOpportunityPriceListId } from "@/lib/services/quotes/resolve-price-list-for-record";
import { computeWeightedAmount } from "./compute";

export { computeWeightedAmount };

/** Either the global db client or a transaction client passed by a route. */
type DbClient = typeof db | Prisma.TransactionClient;

/**
 * Look up firstName + lastName for a user id and return "First Last".
 * Returns null when the id doesn't resolve (kept silent for back-compat —
 * legacy rows had ownerName drift from firstName/lastName edits).
 */
export async function deriveOwnerName(
  userId: string | null | undefined,
  client: DbClient = db,
): Promise<string | null> {
  if (!userId) return null;
  const u = await client.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true },
  });
  if (!u) return null;
  return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || null;
}

export type ListParams = {
  tenantId: string;
  page: number;
  pageSize: number;
  trashed: boolean;
  leadId?: string;
  stage?: QcfOpportunityStage;
  ownerId?: string;
  accountId?: string;
  q?: string;
  aclFilter: Record<string, unknown> | null;
};

const LIST_SELECT = {
  id: true,
  name: true,
  accountId: true,
  account: { select: { id: true, name: true } },
  leadId: true,
  stage: true,
  amount: true,
  currency: true,
  probability: true,
  weightedAmount: true,
  closeDate: true,
  ownerId: true,
  ownerName: true,
  lastStageChangeAt: true,
  lastActivityAt: true,
  deletedAt: true,
  createdAt: true,
} satisfies Prisma.QcfOpportunitySelect;

/**
 * Build the same `where` clause `listOpportunities` uses, so the CSV export
 * branch can reuse it without duplicating the filter logic. Mirrors the
 * pagination-free portion of the JSON branch.
 */
export function buildOpportunityListWhere(
  p: Omit<ListParams, "page" | "pageSize">,
): Prisma.QcfOpportunityWhereInput {
  return {
    tenantId: p.tenantId,
    deletedAt: p.trashed ? { not: null } : null,
    ...(p.leadId ? { leadId: p.leadId } : {}),
    ...(p.stage ? { stage: p.stage } : {}),
    ...(p.ownerId ? { ownerId: p.ownerId } : {}),
    ...(p.accountId ? { accountId: p.accountId } : {}),
    // Search across name + related account name + ownerName. Wrapped in AND so
    // this search OR-group ANDs with (rather than clobbers) the ACL OR-group
    // that accountScopeFilter spreads in below — both use the top-level `OR` key.
    ...(p.q
      ? {
          AND: [
            {
              OR: [
                { name: { contains: p.q, mode: "insensitive" as const } },
                { account: { name: { contains: p.q, mode: "insensitive" as const } } },
                { ownerName: { contains: p.q, mode: "insensitive" as const } },
              ],
            },
          ],
        }
      : {}),
    ...(p.aclFilter ? (p.aclFilter as Prisma.QcfOpportunityWhereInput) : {}),
  };
}

export async function listOpportunities(p: ListParams) {
  const where = buildOpportunityListWhere(p);

  const [items, total] = await Promise.all([
    db.qcfOpportunity.findMany({
      where,
      select: LIST_SELECT,
      // `id desc` tiebreaker → stable page boundaries when many rows share the same createdAt.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
    }),
    db.qcfOpportunity.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / p.pageSize));
  return { items, total, page: p.page, pageSize: p.pageSize, totalPages };
}

export type CreateInput = {
  name: string;
  accountId: string;
  leadId?: string | null;
  priceListId?: string | null;
  stage?: QcfOpportunityStage;
  amount?: number | null;
  currency?: string;
  probability?: number;
  closeDate?: string | Date | null;
  ownerId?: string | null;
};

export async function createOpportunity(args: {
  tenantId: string;
  userId: string;
  input: CreateInput;
  /** Optional transaction client. When passed, all writes run inside the caller's tx. */
  tx?: DbClient;
}) {
  const { tenantId, userId, input } = args;
  const client: DbClient = args.tx ?? db;
  const stage: QcfOpportunityStage = input.stage ?? "Prospecting";
  const probability = input.probability ?? 10;
  // Default owner = creator. Avoids "—" rows in the kanban/list when the
  // form omits the owner picker. Caller can still override via input.ownerId.
  const ownerId = input.ownerId ?? userId;
  const weightedAmount = computeWeightedAmount(input.amount, probability);
  const [ownerName, priceListId] = await Promise.all([
    deriveOwnerName(ownerId, client),
    resolveOpportunityPriceListId({
      tenantId,
      accountId: input.accountId,
      explicitPriceListId: input.priceListId,
      client,
    }),
  ]);

  const data: Prisma.QcfOpportunityUncheckedCreateInput = {
    tenantId,
    name: input.name,
    accountId: input.accountId,
    leadId: input.leadId ?? null,
    priceListId,
    stage,
    probability,
    amount: input.amount ?? null,
    currency: input.currency ?? "INR",
    closeDate: input.closeDate ? new Date(input.closeDate) : null,
    ownerId,
    ownerName,
    weightedAmount,
    lastStageChangeAt: new Date(),
    createdByUserId: userId,
  };

  const created = await client.qcfOpportunity.create({ data });

  await client.qcfActivity.create({
    data: {
      tenantId,
      type: "OpportunityCreated",
      relatedKind: "Opportunity",
      relatedObjectId: created.id,
      subject: `Opportunity created: ${created.name}`,
      ownerId: userId,
      ownerName,
      occurredAt: new Date(),
    },
  });

  return created;
}

export type UpdateInput = Partial<{
  name: string;
  accountId: string;
  leadId: string | null;
  amount: number | null;
  currency: string;
  probability: number;
  closeDate: string | Date | null;
  ownerId: string | null;
  competitorName: string | null;
}>;

/** Stage updates are NOT allowed through the generic patch — see /transition. */
export async function updateOpportunity(args: {
  tenantId: string;
  userId: string;
  id: string;
  input: UpdateInput;
  existing: { ownerId: string | null; amount: unknown; probability: number };
}) {
  const { tenantId, userId, id, input, existing } = args;

  const data: Prisma.QcfOpportunityUncheckedUpdateInput = { ...input };

  if (input.closeDate !== undefined) {
    data.closeDate = input.closeDate ? new Date(input.closeDate) : null;
  }

  // ownerName is derived server-side whenever ownerId moves.
  let ownerChanged = false;
  if (input.ownerId !== undefined && input.ownerId !== existing.ownerId) {
    data.ownerName = await deriveOwnerName(input.ownerId);
    ownerChanged = true;
  }

  // Recompute weightedAmount whenever amount or probability touch.
  const nextAmount = input.amount !== undefined ? input.amount : existing.amount;
  const nextProb = input.probability !== undefined ? input.probability : existing.probability;
  if (input.amount !== undefined || input.probability !== undefined) {
    data.weightedAmount = computeWeightedAmount(nextAmount as number | null, nextProb);
  }

  const updated = await db.qcfOpportunity.update({
    where: { id, tenantId },
    data,
  });

  if (ownerChanged) {
    await db.qcfActivity.create({
      data: {
        tenantId,
        type: "OpportunityOwnerChange",
        relatedKind: "Opportunity",
        relatedObjectId: id,
        subject: `Owner changed: ${updated.name}`,
        outcome: updated.ownerName ?? "",
        ownerId: userId,
        occurredAt: new Date(),
      },
    });
  }

  return updated;
}

export async function softDelete(tenantId: string, id: string): Promise<void> {
  await db.qcfOpportunity.update({
    where: { id, tenantId },
    data: { deletedAt: new Date() },
  });
}

export async function restore(tenantId: string, id: string): Promise<void> {
  await db.qcfOpportunity.update({
    where: { id, tenantId },
    data: { deletedAt: null },
  });
}

/** Recompute amount + weightedAmount from product line totals. */
export async function recalculateFromProducts(
  tenantId: string,
  opportunityId: string,
): Promise<{ amount: number; weightedAmount: number | null }> {
  const opp = await db.qcfOpportunity.findFirst({
    where: { id: opportunityId, tenantId },
    select: { probability: true },
  });
  if (!opp) throw new Error("Opportunity not found");

  const products = await db.qcfOpportunityProduct.findMany({
    where: { tenantId, opportunityId },
    select: { lineTotal: true },
  });
  const amount = products.reduce((sum, p) => sum + Number(String(p.lineTotal)), 0);
  const weightedAmount = computeWeightedAmount(amount, opp.probability);
  await db.qcfOpportunity.update({
    where: { id: opportunityId, tenantId },
    data: { amount, weightedAmount },
  });
  return { amount, weightedAmount };
}
