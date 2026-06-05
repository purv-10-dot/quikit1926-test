import type { CrmProductTaxonomyKind } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export async function listTaxonomy(
  orgId: string,
  kind?: CrmProductTaxonomyKind,
  parentId?: string | null,
) {
  return prisma.crmProductTaxonomy.findMany({
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
    kind: CrmProductTaxonomyKind;
    name: string;
    parentId?: string | null;
    sortOrder?: number;
  },
) {
  if (data.kind === "Subcategory" && !data.parentId) {
    throw Object.assign(new Error("Subcategory requires a parent category."), { statusCode: 400 });
  }
  return prisma.crmProductTaxonomy.create({
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
  const row = await prisma.crmProductTaxonomy.findFirst({ where: { id, orgId } });
  if (!row) throw Object.assign(new Error("Taxonomy node not found."), { statusCode: 404 });
  await prisma.crmProductTaxonomy.delete({ where: { id } });
}
