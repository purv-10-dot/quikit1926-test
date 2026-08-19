/**
 * ICP (Ideal Customer Profile) service — profile CRUD + link management.
 *
 * Follows the price-list service conventions: `orgId` on every query, `select`
 * for list endpoints, soft delete via `deletedAt`, and a
 * `{ items, total, page, pageSize, totalPages }` list envelope.
 *
 * Link semantics are REPLACE-ON-WRITE: `taxonomyIds` / `productIds` /
 * `accountIds` sent to create/update are the complete new set. Omitting a key
 * (undefined) leaves those links untouched; sending `[]` clears them. That
 * distinction is what lets the edit form PATCH only the fields it changed.
 *
 * Deliberately absent: scoring, lead matching, recommendations. This module only
 * stores and retrieves the profile definition.
 */

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type {
  CreateIcpProfileInput,
  IcpTaxonomyKind,
  UpdateIcpProfileInput,
} from "@/lib/validators/icp";

export interface ListIcpParams {
  orgId: string;
  page: number;
  pageSize: number;
  q?: string;
  segment?: "Enterprise" | "MidMarket" | "SMB";
  taxonomyId?: string;
  kind?: IcpTaxonomyKind;
  isActive?: boolean;
  trashed?: boolean;
  sortBy: "updatedAt" | "createdAt" | "name";
  sortDir: "asc" | "desc";
}

const LIST_SELECT = {
  id: true,
  name: true,
  description: true,
  segment: true,
  employeeCountMin: true,
  employeeCountMax: true,
  annualRevenueMin: true,
  annualRevenueMax: true,
  revenueCurrency: true,
  countryCodes: true,
  regions: true,
  isActive: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CrmIcpProfileSelect;

export function buildIcpWhere(
  p: Omit<ListIcpParams, "page" | "pageSize" | "sortBy" | "sortDir">,
): Prisma.CrmIcpProfileWhereInput {
  const where: Prisma.CrmIcpProfileWhereInput = {
    orgId: p.orgId,
    // Soft delete is filtered explicitly — no Prisma middleware covers Crm*
    // models (see packages/database/index.ts SOFT_DELETE_MODELS).
    deletedAt: p.trashed ? { not: null } : null,
  };

  if (p.q) {
    where.OR = [
      { name: { contains: p.q, mode: "insensitive" } },
      { description: { contains: p.q, mode: "insensitive" } },
      { personaNotes: { contains: p.q, mode: "insensitive" } },
    ];
  }
  if (p.segment) where.segment = p.segment;
  if (p.isActive !== undefined) where.isActive = p.isActive;

  // Filter by a specific linked taxonomy row, or by any link of a given kind.
  if (p.taxonomyId) {
    where.taxonomyLinks = { some: { orgId: p.orgId, taxonomyId: p.taxonomyId } };
  } else if (p.kind) {
    where.taxonomyLinks = { some: { orgId: p.orgId, kind: p.kind } };
  }

  return where;
}

function listOrderBy(p: Pick<ListIcpParams, "sortBy" | "sortDir">) {
  const dir = p.sortDir;
  if (p.sortBy === "name") return { name: dir };
  if (p.sortBy === "createdAt") return { createdAt: dir };
  return { updatedAt: dir };
}

export async function listIcpProfiles(p: ListIcpParams) {
  const where = buildIcpWhere(p);
  const [items, total] = await Promise.all([
    db.crmIcpProfile.findMany({
      where,
      select: {
        ...LIST_SELECT,
        _count: { select: { taxonomyLinks: true, productLinks: true, accountLinks: true } },
      },
      orderBy: listOrderBy(p),
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
    }),
    db.crmIcpProfile.count({ where }),
  ]);

  type RawRow = (typeof items)[number] & {
    _count: { taxonomyLinks: number; productLinks: number; accountLinks: number };
  };
  const enriched = (items as RawRow[]).map(({ _count, ...rest }) => ({
    ...rest,
    // Decimal is not JSON-serialisable across the RSC/route boundary.
    annualRevenueMin: rest.annualRevenueMin ? rest.annualRevenueMin.toString() : null,
    annualRevenueMax: rest.annualRevenueMax ? rest.annualRevenueMax.toString() : null,
    taxonomyCount: _count.taxonomyLinks,
    productCount: _count.productLinks,
    accountCount: _count.accountLinks,
  }));

  const totalPages = Math.max(1, Math.ceil(total / p.pageSize));
  return { items: enriched, total, page: p.page, pageSize: p.pageSize, totalPages };
}

const DETAIL_INCLUDE = {
  taxonomyLinks: {
    select: {
      taxonomyId: true,
      kind: true,
      taxonomy: { select: { id: true, name: true, kind: true, code: true } },
    },
    orderBy: { createdAt: "asc" },
  },
  productLinks: {
    select: {
      productId: true,
      product: { select: { id: true, name: true, sku: true, productType: true } },
    },
    orderBy: { createdAt: "asc" },
  },
  accountLinks: {
    select: {
      accountId: true,
      note: true,
      account: { select: { id: true, name: true, industry: true, segmentEnum: true } },
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.CrmIcpProfileInclude;

/** Detail read. Returns null when the id is absent or belongs to another org. */
export async function getIcpProfile(orgId: string, id: string) {
  const row = await db.crmIcpProfile.findFirst({
    where: { id, orgId },
    include: DETAIL_INCLUDE,
  });
  if (!row) return null;
  return {
    ...row,
    annualRevenueMin: row.annualRevenueMin ? row.annualRevenueMin.toString() : null,
    annualRevenueMax: row.annualRevenueMax ? row.annualRevenueMax.toString() : null,
  };
}

/**
 * Validate that every referenced id belongs to this org, so a caller can't link
 * another tenant's product/account/taxonomy by guessing a cuid. Throws a
 * 400-shaped error naming the offending field.
 */
async function assertLinkOwnership(
  orgId: string,
  ids: { taxonomyIds?: string[]; productIds?: string[]; accountIds?: string[] },
): Promise<void> {
  const checks: Array<Promise<void>> = [];

  if (ids.taxonomyIds?.length) {
    const unique = [...new Set(ids.taxonomyIds)];
    checks.push(
      db.crmIcpTaxonomy
        .count({ where: { orgId, id: { in: unique } } })
        .then((n) => {
          if (n !== unique.length) throw badRequest("taxonomyIds", "One or more selections are invalid");
        }),
    );
  }
  if (ids.productIds?.length) {
    const unique = [...new Set(ids.productIds)];
    checks.push(
      db.crmProduct
        .count({ where: { orgId, id: { in: unique }, deletedAt: null } })
        .then((n) => {
          if (n !== unique.length) throw badRequest("productIds", "One or more products are invalid");
        }),
    );
  }
  if (ids.accountIds?.length) {
    const unique = [...new Set(ids.accountIds)];
    checks.push(
      db.crmAccount
        .count({ where: { orgId, id: { in: unique }, deletedAt: null } })
        .then((n) => {
          if (n !== unique.length) throw badRequest("accountIds", "One or more companies are invalid");
        }),
    );
  }

  await Promise.all(checks);
}

function badRequest(field: string, message: string): Error & {
  statusCode: number;
  fieldErrors: Record<string, string>;
} {
  const err = new Error(message) as Error & {
    statusCode: number;
    fieldErrors: Record<string, string>;
  };
  err.statusCode = 400;
  err.fieldErrors = { [field]: message };
  return err;
}

/** Scalar columns only — link arrays are handled separately. */
function scalarData(input: CreateIcpProfileInput | UpdateIcpProfileInput) {
  const scalars: Record<string, unknown> = { ...input };
  delete scalars.taxonomyIds;
  delete scalars.productIds;
  delete scalars.accountIds;
  return scalars;
}

export async function createIcpProfile(args: {
  orgId: string;
  userId: string;
  input: CreateIcpProfileInput;
}) {
  const { orgId, userId, input } = args;
  await assertLinkOwnership(orgId, input);

  const taxonomyRows = await resolveTaxonomyKinds(orgId, input.taxonomyIds);

  return db.crmIcpProfile.create({
    data: {
      ...scalarData(input),
      orgId,
      createdByUserId: userId,
      updatedByUserId: userId,
      taxonomyLinks: taxonomyRows.length
        ? { create: taxonomyRows.map((t) => ({ orgId, taxonomyId: t.id, kind: t.kind })) }
        : undefined,
      productLinks: input.productIds?.length
        ? { create: [...new Set(input.productIds)].map((productId) => ({ orgId, productId })) }
        : undefined,
      accountLinks: input.accountIds?.length
        ? { create: [...new Set(input.accountIds)].map((accountId) => ({ orgId, accountId })) }
        : undefined,
    },
    select: { id: true, name: true },
  });
}

/**
 * `kind` is denormalised onto the link row, so it must be read from the master
 * at link time rather than trusted from the client.
 */
async function resolveTaxonomyKinds(
  orgId: string,
  taxonomyIds: string[] | undefined,
): Promise<Array<{ id: string; kind: IcpTaxonomyKind }>> {
  if (!taxonomyIds?.length) return [];
  const rows = await db.crmIcpTaxonomy.findMany({
    where: { orgId, id: { in: [...new Set(taxonomyIds)] } },
    select: { id: true, kind: true },
  });
  return rows as Array<{ id: string; kind: IcpTaxonomyKind }>;
}

export async function updateIcpProfile(args: {
  orgId: string;
  id: string;
  userId: string;
  input: UpdateIcpProfileInput;
}) {
  const { orgId, id, userId, input } = args;

  const existing = await db.crmIcpProfile.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!existing) {
    const err = new Error("ICP profile not found") as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  await assertLinkOwnership(orgId, input);
  const taxonomyRows = await resolveTaxonomyKinds(orgId, input.taxonomyIds);

  return db.$transaction(async (tx) => {
    // Replace-on-write: only touch a link set the caller actually sent.
    if (input.taxonomyIds !== undefined) {
      await tx.crmIcpProfileTaxonomy.deleteMany({ where: { orgId, icpProfileId: id } });
      if (taxonomyRows.length) {
        await tx.crmIcpProfileTaxonomy.createMany({
          data: taxonomyRows.map((t) => ({ orgId, icpProfileId: id, taxonomyId: t.id, kind: t.kind })),
          skipDuplicates: true,
        });
      }
    }
    if (input.productIds !== undefined) {
      await tx.crmIcpProfileProduct.deleteMany({ where: { orgId, icpProfileId: id } });
      if (input.productIds.length) {
        await tx.crmIcpProfileProduct.createMany({
          data: [...new Set(input.productIds)].map((productId) => ({ orgId, icpProfileId: id, productId })),
          skipDuplicates: true,
        });
      }
    }
    if (input.accountIds !== undefined) {
      await tx.crmIcpProfileAccount.deleteMany({ where: { orgId, icpProfileId: id } });
      if (input.accountIds.length) {
        await tx.crmIcpProfileAccount.createMany({
          data: [...new Set(input.accountIds)].map((accountId) => ({ orgId, icpProfileId: id, accountId })),
          skipDuplicates: true,
        });
      }
    }

    return tx.crmIcpProfile.update({
      where: { id },
      data: { ...scalarData(input), updatedByUserId: userId },
      select: { id: true, name: true },
    });
  });
}

export async function softDeleteIcpProfile(args: {
  orgId: string;
  id: string;
  userId: string;
}): Promise<void> {
  const found = await db.crmIcpProfile.findFirst({
    where: { id: args.id, orgId: args.orgId, deletedAt: null },
    select: { id: true },
  });
  if (!found) {
    const err = new Error("ICP profile not found") as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }
  await db.crmIcpProfile.update({
    where: { id: args.id },
    data: { deletedAt: new Date(), updatedByUserId: args.userId },
  });
}

export async function restoreIcpProfile(args: {
  orgId: string;
  id: string;
  userId: string;
}): Promise<void> {
  const found = await db.crmIcpProfile.findFirst({
    where: { id: args.id, orgId: args.orgId, deletedAt: { not: null } },
    select: { id: true },
  });
  if (!found) {
    const err = new Error("Trashed ICP profile not found") as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }
  await db.crmIcpProfile.update({
    where: { id: args.id },
    data: { deletedAt: null, updatedByUserId: args.userId },
  });
}

/** Hard delete — only reachable from the trash view. Links cascade. */
export async function permanentDeleteIcpProfile(orgId: string, id: string): Promise<void> {
  const found = await db.crmIcpProfile.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!found) {
    const err = new Error("ICP profile not found") as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }
  await db.crmIcpProfile.delete({ where: { id } });
}

/** Header stats for the list page. Three cheap counts. */
export async function computeIcpStats(orgId: string) {
  const [total, active, taxonomyTotal] = await Promise.all([
    db.crmIcpProfile.count({ where: { orgId, deletedAt: null } }),
    db.crmIcpProfile.count({ where: { orgId, deletedAt: null, isActive: true } }),
    db.crmIcpTaxonomy.count({ where: { orgId, isActive: true } }),
  ]);
  return { total, active, taxonomyTotal };
}
