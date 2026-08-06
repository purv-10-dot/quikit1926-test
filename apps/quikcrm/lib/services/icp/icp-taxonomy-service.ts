/**
 * ICP taxonomy master service — Industries, Verticals, Technologies.
 *
 * One polymorphic table keyed by `kind` (mirrors CrmProductTaxonomy in the same
 * schema) rather than three near-identical tables, so adding a fourth dimension
 * later needs no migration.
 *
 * No soft delete here: these are small controlled vocabularies, and a delete is
 * blocked outright while any ICP still references the row (see
 * deleteIcpTaxonomy). That is friendlier than orphaning links or hiding rows in
 * a trash view a user would never visit.
 */

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { IcpTaxonomyKind } from "@/lib/validators/icp";

export interface ListTaxonomyParams {
  orgId: string;
  page: number;
  pageSize: number;
  q?: string;
  kind?: IcpTaxonomyKind;
  isActive?: boolean;
}

const LIST_SELECT = {
  id: true,
  kind: true,
  name: true,
  code: true,
  parentId: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CrmIcpTaxonomySelect;

function buildWhere(
  p: Omit<ListTaxonomyParams, "page" | "pageSize">,
): Prisma.CrmIcpTaxonomyWhereInput {
  const where: Prisma.CrmIcpTaxonomyWhereInput = { orgId: p.orgId };
  if (p.kind) where.kind = p.kind;
  if (p.isActive !== undefined) where.isActive = p.isActive;
  if (p.q) {
    where.OR = [
      { name: { contains: p.q, mode: "insensitive" } },
      { code: { contains: p.q, mode: "insensitive" } },
    ];
  }
  return where;
}

export async function listIcpTaxonomy(p: ListTaxonomyParams) {
  const where = buildWhere(p);
  const [items, total] = await Promise.all([
    db.crmIcpTaxonomy.findMany({
      where,
      select: {
        ...LIST_SELECT,
        parent: { select: { id: true, name: true } },
        _count: { select: { profileLinks: true } },
      },
      // Kind groups the list, then the org's chosen order, then name.
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
    }),
    db.crmIcpTaxonomy.count({ where }),
  ]);

  type RawRow = (typeof items)[number] & { _count: { profileLinks: number } };
  const enriched = (items as RawRow[]).map(({ _count, ...rest }) => ({
    ...rest,
    usageCount: _count.profileLinks,
  }));

  const totalPages = Math.max(1, Math.ceil(total / p.pageSize));
  return { items: enriched, total, page: p.page, pageSize: p.pageSize, totalPages };
}

/**
 * Unpaginated active rows for the ICP form's multi-select pickers. Capped so a
 * runaway vocabulary can't produce an unbounded payload.
 */
export async function listIcpTaxonomyOptions(orgId: string, kind?: IcpTaxonomyKind) {
  return db.crmIcpTaxonomy.findMany({
    where: { orgId, isActive: true, ...(kind ? { kind } : {}) },
    select: { id: true, kind: true, name: true, code: true, parentId: true },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    take: 1000,
  });
}

function conflict(message: string): Error & { statusCode: number; fieldErrors: Record<string, string> } {
  const err = new Error(message) as Error & {
    statusCode: number;
    fieldErrors: Record<string, string>;
  };
  err.statusCode = 409;
  err.fieldErrors = { name: message };
  return err;
}

function notFound(): Error & { statusCode: number } {
  const err = new Error("Taxonomy entry not found") as Error & { statusCode: number };
  err.statusCode = 404;
  return err;
}

/** A parent must exist in the same org AND be of the same kind. */
async function assertParent(
  orgId: string,
  kind: IcpTaxonomyKind,
  parentId: string | null | undefined,
  selfId?: string,
): Promise<void> {
  if (!parentId) return;
  if (selfId && parentId === selfId) {
    const err = new Error("An entry cannot be its own parent") as Error & {
      statusCode: number;
      fieldErrors: Record<string, string>;
    };
    err.statusCode = 400;
    err.fieldErrors = { parentId: "An entry cannot be its own parent" };
    throw err;
  }
  const parent = await db.crmIcpTaxonomy.findFirst({
    where: { id: parentId, orgId },
    select: { id: true, kind: true },
  });
  if (!parent || parent.kind !== kind) {
    const err = new Error("Parent must be an entry of the same type") as Error & {
      statusCode: number;
      fieldErrors: Record<string, string>;
    };
    err.statusCode = 400;
    err.fieldErrors = { parentId: "Parent must be an entry of the same type" };
    throw err;
  }
}

export async function createIcpTaxonomy(args: {
  orgId: string;
  input: {
    kind: IcpTaxonomyKind;
    name: string;
    code?: string | null;
    parentId?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  };
}) {
  const { orgId, input } = args;
  await assertParent(orgId, input.kind, input.parentId);
  try {
    return await db.crmIcpTaxonomy.create({
      data: { ...input, orgId },
      select: { id: true, kind: true, name: true },
    });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002") {
      throw conflict(`A ${input.kind.toLowerCase()} with this name already exists.`);
    }
    throw e;
  }
}

export async function updateIcpTaxonomy(args: {
  orgId: string;
  id: string;
  input: {
    name?: string;
    code?: string | null;
    parentId?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  };
}) {
  const { orgId, id, input } = args;
  const existing = await db.crmIcpTaxonomy.findFirst({
    where: { id, orgId },
    select: { id: true, kind: true },
  });
  if (!existing) throw notFound();

  if (input.parentId !== undefined) {
    await assertParent(orgId, existing.kind as IcpTaxonomyKind, input.parentId, id);
  }

  try {
    return await db.crmIcpTaxonomy.update({
      where: { id },
      data: input,
      select: { id: true, kind: true, name: true },
    });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002") {
      throw conflict("Another entry of this type already uses that name.");
    }
    throw e;
  }
}

/**
 * Hard delete, blocked while the entry is in use or has children.
 *
 * Refusing with a count is better than cascading: the link rows would vanish
 * from ICPs silently, and `onDelete: Cascade` on the link table means the DB
 * would happily do it. Deactivating (`isActive: false`) is the soft path — it
 * hides the row from pickers while leaving existing links intact.
 */
export async function deleteIcpTaxonomy(orgId: string, id: string): Promise<void> {
  const existing = await db.crmIcpTaxonomy.findFirst({
    where: { id, orgId },
    select: {
      id: true,
      _count: { select: { profileLinks: true, children: true } },
    },
  });
  if (!existing) throw notFound();

  const { profileLinks, children } = existing._count;
  if (profileLinks > 0) {
    const err = new Error(
      `In use by ${profileLinks} ICP profile${profileLinks === 1 ? "" : "s"}. ` +
        "Deactivate it instead to hide it from new profiles.",
    ) as Error & { statusCode: number };
    err.statusCode = 409;
    throw err;
  }
  if (children > 0) {
    const err = new Error(
      `Has ${children} child ${children === 1 ? "entry" : "entries"}. Delete or reassign them first.`,
    ) as Error & { statusCode: number };
    err.statusCode = 409;
    throw err;
  }

  await db.crmIcpTaxonomy.delete({ where: { id } });
}
