import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { writableAssetIds } from "@/lib/api/assetScope";

const auth = withOrgAuthForResource("Asset");

const updateSchema = z.object({
  warehouse: z.string().nullable().optional(),
  assetType: z.string().optional(),
  baseCategoryId: z.string().optional(),
  categoryId: z.string().optional(),
  itemName: z.string().optional(),
  itemCode: z.string().optional(),
  serialNumber: z.string().optional(),
  invoiceNumber: z.string().optional(),
  price: z.coerce.number().nullable().optional(),
  purchaseDate: z.string().optional(),
  location: z.string().optional(),
  condition: z.string().optional(),
  warrantyEndDate: z.string().nullable().optional(),
  description: z.string().optional(),
  assetStatus: z.string().optional(),
});

export const PUT = auth.update<{ id: string }>(async ({ orgId, userId, userEmail }, req, { params }) => {
  const { id } = params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  // Row scope: non-viewAll callers may only touch assets assigned to them.
  const [writable] = await writableAssetIds(orgId, userId, userEmail, [id]);
  if (!writable) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const row = await db.astAsset.findFirst({ where: { id, orgId }, select: { id: true } });
  if (!row) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const data = parsed.data as Prisma.AstAssetUncheckedUpdateInput;
  const asset = await db.astAsset.update({
    where: { id },
    data,
    include: { baseCategory: true, category: true },
  });
  await audit({
    orgId,
    module: "Assets",
    action: "Asset Updated",
    entityId: asset.id,
    entityName: `${asset.itemName} (${asset.itemCode})`,
    actorId: userId,
    actorEmail: userEmail,
  });
  return NextResponse.json({ success: true, data: asset });
});

export const DELETE = auth.delete<{ id: string }>(async ({ orgId, userId, userEmail }, _req, { params }) => {
  const { id } = params;
  // Row scope: non-viewAll callers may only touch assets assigned to them.
  const [writable] = await writableAssetIds(orgId, userId, userEmail, [id]);
  if (!writable) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const existing = await db.astAsset.findFirst({
    where: { id, orgId },
    select: { id: true, itemName: true, itemCode: true },
  });
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  await db.astAsset.delete({ where: { id } });
  await audit({
    orgId,
    module: "Assets",
    action: "Asset Deleted",
    entityId: id,
    entityName: `${existing.itemName} (${existing.itemCode})`,
    actorId: userId,
    actorEmail: userEmail,
  });
  return NextResponse.json({ success: true, data: { ok: true } });
});
