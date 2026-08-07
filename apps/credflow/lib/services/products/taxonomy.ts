import type { QcfProductTaxonomyKind } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export async function listTaxonomy(
  tenantId: string,
  kind?: QcfProductTaxonomyKind,
  parentId?: string | null,
) {
  return prisma.qcfProductTaxonomy.findMany({
    where: {
      tenantId,
      ...(kind ? { kind } : {}),
      ...(parentId !== undefined ? { parentId } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function createTaxonomy(
  tenantId: string,
  data: {
    kind: QcfProductTaxonomyKind;
    name: string;
    parentId?: string | null;
    sortOrder?: number;
  },
) {
  if (data.kind === "Subcategory" && !data.parentId) {
    throw Object.assign(new Error("Subcategory requires a parent category."), { statusCode: 400 });
  }
  return prisma.qcfProductTaxonomy.create({
    data: {
      tenantId,
      kind: data.kind,
      name: data.name.trim(),
      parentId: data.parentId ?? null,
      sortOrder: data.sortOrder ?? 0,
    },
  });
}

export async function deleteTaxonomy(tenantId: string, id: string) {
  const row = await prisma.qcfProductTaxonomy.findFirst({ where: { id, tenantId } });
  if (!row) throw Object.assign(new Error("Taxonomy node not found."), { statusCode: 404 });
  await prisma.qcfProductTaxonomy.delete({ where: { id } });
}
