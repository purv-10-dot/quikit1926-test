import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

const auth = withOrgAuthForResource("Asset");

const createSchema = z.object({
  warehouse: z.string().nullable().optional(),
  assetType: z.string(),
  baseCategoryId: z.string(),
  categoryId: z.string(),
  itemName: z.string(),
  itemCode: z.string(),
  serialNumber: z.string(),
  invoiceNumber: z.string(),
  price: z.coerce.number().nullable().optional(),
  purchaseDate: z.string(),
  location: z.string(),
  condition: z.string(),
  warrantyEndDate: z.string().nullable().optional(),
  description: z.string().optional(),
  assetStatus: z.string().optional(),
});

export const GET = auth.view(async ({ orgId }) => {
  const assets = await db.astAsset.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    include: {
      baseCategory: true,
      category: true,
      replacementsReceived: {
        where: { isActive: true },
        take: 1,
        orderBy: { createdAt: "desc" },
      },
    },
  });
  return NextResponse.json({ success: true, data: assets });
});

export const POST = auth.create(async ({ orgId, userId, userEmail }, req) => {
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const data: Prisma.AstAssetUncheckedCreateInput = {
    ...parsed.data,
    description: parsed.data.description ?? "",
    assetStatus: parsed.data.assetStatus as Prisma.AstAssetUncheckedCreateInput["assetStatus"],
    orgId,
  };
  const asset = await db.astAsset.create({
    data,
    include: { baseCategory: true, category: true },
  });
  await audit({
    orgId,
    module: "Assets",
    action: "Asset Created",
    entityId: asset.id,
    entityName: `${asset.itemName} (${asset.itemCode})`,
    details: `Category: ${asset.category?.name}`,
    actorId: userId,
    actorEmail: userEmail,
  });
  return NextResponse.json({ success: true, data: asset }, { status: 201 });
});
