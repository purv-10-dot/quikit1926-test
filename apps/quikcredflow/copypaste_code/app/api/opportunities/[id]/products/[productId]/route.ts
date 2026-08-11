import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { assertAccountAccess } from "@/lib/auth/account-acl";
import { computeProductLineTotal } from "@/lib/services/opportunities/compute";
import { toNumber } from "@/lib/services/opportunities/currency";

export const runtime = "nodejs";

function err(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

const updateSchema = z
  .object({
    productName: z.string().min(1).max(200).optional(),
    quantity: z.number().int().min(1).optional(),
    unitPrice: z.number().nonnegative().optional(),
    discountPct: z.number().int().min(0).max(100).optional(),
    notes: z.string().max(1000).nullable().optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; productId: string }> },
) {
  try {
    const { id, productId } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "opportunities", "edit");

    const opp = await db.crmOpportunity.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true, accountId: true },
    });
    if (!opp) return err("Not found", 404);
    await assertAccountAccess(user, opp.accountId);

    const product = await db.crmOpportunityProduct.findFirst({
      where: { id: productId, tenantId: user.tenantId, opportunityId: id },
    });
    if (!product) return err("Not found", 404);

    const body = await req.json().catch(() => null);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return err(
        "Validation failed: " +
          parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        400,
      );
    }

    const nextQty = parsed.data.quantity ?? product.quantity;
    const nextUnit = parsed.data.unitPrice ?? toNumber(product.unitPrice);
    const nextDiscount = parsed.data.discountPct ?? product.discountPct;

    const updated = await db.crmOpportunityProduct.update({
      where: { id: productId },
      data: {
        ...parsed.data,
        lineTotal: computeProductLineTotal(nextQty, nextUnit, nextDiscount),
      },
    });
    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        unitPrice: toNumber(updated.unitPrice),
        lineTotal: toNumber(updated.lineTotal),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update product";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    return err(message, status);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; productId: string }> },
) {
  try {
    const { id, productId } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "opportunities", "edit");

    const opp = await db.crmOpportunity.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true, accountId: true },
    });
    if (!opp) return err("Not found", 404);
    await assertAccountAccess(user, opp.accountId);

    const result = await db.crmOpportunityProduct.deleteMany({
      where: { id: productId, tenantId: user.tenantId, opportunityId: id },
    });
    if (result.count === 0) return err("Not found", 404);
    return NextResponse.json({ success: true, data: { id: productId, deleted: true } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete product";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    return err(message, status);
  }
}
