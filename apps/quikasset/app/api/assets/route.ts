import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { userCan } from "@/lib/api/permissions";
import { assignedAssetIdsForEmail } from "@/lib/api/assetScope";
import { resolveActorNames } from "@/lib/api/actorNames";

const auth = withOrgAuthForResource("Asset");

const createSchema = z.object({
  warehouse: z.string().nullable().optional(),
  // The form no longer collects Fixed/Consumable (that dropdown was merged into the
  // base-category "Asset Type" field); defaulted below so the column stays populated.
  assetType: z.string().optional(),
  baseCategoryId: z.string(),
  categoryId: z.string(),
  itemName: z.string(),
  itemCode: z.string().trim().min(1, "Item Code is required"),
  serialNumber: z.string().trim().min(1, "Serial Number is required"),
  invoiceNumber: z.string(),
  price: z.number({ required_error: "Price is required", invalid_type_error: "Price is required" }).nonnegative("Price must be 0 or more"),
  purchaseDate: z.string(),
  location: z.string(),
  condition: z.string(),
  warrantyEndDate: z.string().nullable().optional(),
  description: z.string().optional(),
  assetStatus: z.string().optional(),
});

// Role-aware list. Callers with the `Asset:viewAll` capability (admin/asset
// managers) get the full org register; everyone else is scoped to the assets
// assigned to them. Scoping uses the email-match STOPGAP — see assetScope.ts.
export const GET = auth.view(async ({ orgId, userId, userEmail }) => {
  const canViewAll = await userCan(userId, orgId, "Asset", "viewAll");

  const where: Prisma.AstAssetWhereInput = { orgId };
  if (!canViewAll) {
    const assignedIds = await assignedAssetIdsForEmail(orgId, userEmail);
    if (assignedIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }
    where.id = { in: assignedIds };
  }

  const assets = await db.astAsset.findMany({
    where,
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

  // Resolve "Added by" names in one batched User lookup.
  const actorNames = await resolveActorNames(assets.map((a) => a.createdByUserId));
  const data = assets.map((a) => ({
    ...a,
    addedByName: a.createdByUserId ? actorNames.get(a.createdByUserId) ?? null : null,
  }));

  return NextResponse.json({ success: true, data });
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
    // Vestigial classification — no longer set from the form; keep a sane default.
    assetType: parsed.data.assetType?.trim() || "Fixed",
    description: parsed.data.description ?? "",
    assetStatus: parsed.data.assetStatus as Prisma.AstAssetUncheckedCreateInput["assetStatus"],
    orgId,
    createdByUserId: userId,
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
