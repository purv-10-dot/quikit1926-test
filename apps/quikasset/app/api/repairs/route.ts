import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

const auth = withOrgAuthForResource("Repair");

const createSchema = z.object({
  assetId: z.string(),
  issueTitle: z.string(),
  issueDescription: z.string(),
  // Vendor is now a picker (AstVendor FK); the legacy free-text `vendor` column
  // stays for old repairs but new repairs set vendorId instead.
  vendorId: z.string().nullable().optional(),
  estimatedCost: z.coerce.number().nullable().optional(),
  sentDate: z.string(),
  expectedReturn: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const GET = auth.view(async ({ orgId }) => {
  const repairs = await db.astRepair.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    include: { asset: { include: { baseCategory: true, category: true } }, vendorRef: true },
  });
  return NextResponse.json({ success: true, data: repairs });
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
  const { assetId, issueTitle, issueDescription, vendorId, estimatedCost, sentDate, expectedReturn, notes } =
    parsed.data;

  const assetOwned = await db.astAsset.findFirst({ where: { id: assetId, orgId }, select: { id: true } });
  if (!assetOwned) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  // Guard the vendor FK against cross-org linking.
  if (vendorId) {
    const vendorOwned = await db.astVendor.findFirst({ where: { id: vendorId, orgId }, select: { id: true } });
    if (!vendorOwned) return NextResponse.json({ success: false, error: "Vendor not found" }, { status: 404 });
  }

  const repair = await db.$transaction(async (tx) => {
    const created = await tx.astRepair.create({
      data: {
        orgId,
        assetId,
        issueTitle,
        issueDescription,
        vendorId: vendorId || null,
        estimatedCost: estimatedCost ?? null,
        sentDate,
        expectedReturn: expectedReturn || null,
        notes: notes || null,
        status: "InRepair",
      },
      include: { asset: { include: { baseCategory: true, category: true } }, vendorRef: true },
    });
    await tx.astAsset.update({ where: { id: assetId }, data: { assetStatus: "InRepair" } });
    return created;
  });

  await audit({
    orgId,
    module: "Repairs",
    action: "Sent to Repair",
    entityId: repair.id,
    entityName: repair.asset?.itemName ?? repair.assetId,
    details: repair.issueTitle,
    actorId: userId,
    actorEmail: userEmail,
  });
  return NextResponse.json({ success: true, data: repair }, { status: 201 });
});
