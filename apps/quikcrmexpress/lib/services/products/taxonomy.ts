import type { QceProductTaxonomyKind } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export async function listTaxonomy(
  orgId: string,
  kind?: QceProductTaxonomyKind,
  parentId?: string | null,
) {
  return prisma.qceProductTaxonomy.findMany({
    where: {
      orgId,
      ...(kind ? { kind } : {}),
      ...(parentId !== undefined ? { parentId } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function createTaxonomy(
  orgId: string,
  data: {
    kind: QceProductTaxonomyKind;
    name: string;
    parentId?: string | null;
    sortOrder?: number;
  },
) {
  if (data.kind === "Subcategory" && !data.parentId) {
    throw Object.assign(new Error("Subcategory requires a parent category."), { statusCode: 400 });
  }
  return prisma.qceProductTaxonomy.create({
    data: {
      orgId,
      kind: data.kind,
      name: data.name.trim(),
      parentId: data.parentId ?? null,
      sortOrder: data.sortOrder ?? 0,
    },
  });
}

export async function deleteTaxonomy(orgId: string, id: string) {
  const row = await prisma.qceProductTaxonomy.findFirst({ where: { id, orgId } });
  if (!row) throw Object.assign(new Error("Taxonomy node not found."), { statusCode: 404 });
  await prisma.qceProductTaxonomy.delete({ where: { id } });
}
