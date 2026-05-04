import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { z } from "zod";

const withOrgAuth = withOrgAuthForModule("purchase");

const awardSchema = z.object({
  vendorId: z.string().min(1),
  quotationRef: z.string().optional().nullable(),
  totalAmount: z.number().min(0),
});

/**
 * POST /api/purchase/rfqs/[id]/award
 * Marks ONE vendor as awarded on the RFQ (and captures their quoted amount).
 * Flips RFQ status → awarded. Other vendors' rows stay (isAwarded=false).
 */
export const POST = withOrgAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const rfq = await db.cnRFQ.findFirst({
    where: { id: params.id, orgId, deletedAt: null },
    include: { vendors: true },
  });
  if (!rfq) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (rfq.status === "awarded") {
    return NextResponse.json({ success: false, error: "RFQ is already awarded" }, { status: 409 });
  }

  const body = await req.json();
  const input = awardSchema.parse(body);

  const rv = rfq.vendors.find((v) => v.vendorId === input.vendorId);
  if (!rv) {
    return NextResponse.json(
      { success: false, error: "Vendor is not on this RFQ's vendor list" },
      { status: 400 },
    );
  }

  await db.$transaction(async (tx) => {
    // Reset any previous award + set this vendor
    await tx.cnRFQVendor.updateMany({
      where: { rfqId: rfq.id },
      data: { isAwarded: false },
    });
    await tx.cnRFQVendor.update({
      where: { id: rv.id },
      data: {
        isAwarded: true,
        quotationRef: input.quotationRef ?? null,
        totalAmount: input.totalAmount,
      },
    });
    await tx.cnRFQ.update({
      where: { id: rfq.id },
      data: { status: "awarded", updatedBy: userId },
    });
  });

  return NextResponse.json({ success: true });
});
