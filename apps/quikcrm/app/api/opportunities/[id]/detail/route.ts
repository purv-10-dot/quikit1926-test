import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { assertAccountAccess } from "@/lib/auth/account-acl";
import { formatGeneric, toNumber } from "@/lib/services/opportunities/currency";

export const runtime = "nodejs";

function err(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "opportunities", "view");

    const opp = await db.crmOpportunity.findFirst({
      where: { id, orgId: user.orgId },
      include: {
        account: { select: { id: true, name: true, status: true } },
        clientMeetings: { orderBy: { meetingAt: "desc" }, take: 50 },
        products: { orderBy: { sortOrder: "asc" } },
        transitions: { orderBy: { occurredAt: "desc" }, take: 30 },
      },
    });
    if (!opp) return err("Not found", 404);
    await assertAccountAccess(user, opp.accountId, { recordOwnerId: opp.ownerId });

    const data = {
      ...opp,
      amount: opp.amount == null ? null : toNumber(opp.amount),
      weightedAmount: opp.weightedAmount == null ? null : toNumber(opp.weightedAmount),
      amountDisplay: formatGeneric(
        opp.amount == null ? null : toNumber(opp.amount),
        (opp.currency ?? "INR").toUpperCase(),
      ),
      products: opp.products.map((p) => ({
        ...p,
        unitPrice: toNumber(p.unitPrice),
        lineTotal: toNumber(p.lineTotal),
      })),
    };
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to read opportunity";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    return err(message, status);
  }
}
