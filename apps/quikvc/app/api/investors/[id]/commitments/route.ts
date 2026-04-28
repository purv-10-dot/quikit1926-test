/**
 * POST /api/investors/[id]/commitments — record a commitment from an investor.
 *
 * Type "one-shot": totalAmount is fully callable immediately.
 * Type "scheduled": totalAmount is target; capital calls drawn down over time.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withTenantAuth } from "@/lib/api/withTenantAuth";
import { getVCRole, denyIfNotInRoles, FUND_ADMIN_ROLES } from "@/lib/rbac";

const postSchema = z.object({
  /// Amount in lakhs (UI-friendly); converted to paise on the server
  amountLakhs: z.number().int().positive().max(10_000_000),
  type: z.enum(["one-shot", "scheduled"]).default("one-shot"),
  vintageYear: z.number().int().min(2000).max(2100).optional(),
});

export const POST = withTenantAuth(
  async ({ tenantId, userId }, req: NextRequest, { params }: { params: { id: string } }) => {
    const denied = denyIfNotInRoles(await getVCRole(userId, tenantId), FUND_ADMIN_ROLES);
    if (denied) return denied;

    const parsed = postSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const investor = await db.vCInvestor.findFirst({
      where: { id: params.id, tenantId },
      select: { id: true },
    });
    if (!investor) {
      return NextResponse.json({ success: false, error: "Investor not found" }, { status: 404 });
    }
    const commitment = await db.vCCommitment.create({
      data: {
        tenantId,
        investorId: investor.id,
        type: parsed.data.type,
        totalAmount: BigInt(parsed.data.amountLakhs) * BigInt(10_000_000),
        currency: "INR",
        vintageYear: parsed.data.vintageYear ?? new Date().getFullYear(),
        status: "active",
        createdBy: userId,
        updatedBy: userId,
      },
      select: { id: true, type: true, totalAmount: true, vintageYear: true },
    });
    return NextResponse.json({
      success: true,
      data: { ...commitment, totalAmount: commitment.totalAmount.toString() },
    }, { status: 201 });
  },
);
