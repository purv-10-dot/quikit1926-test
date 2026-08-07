import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { accountScopeFilter } from "@/lib/auth/account-acl";
import { formatGeneric, toNumber } from "@/lib/services/opportunities/currency";

export const runtime = "nodejs";

function err(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> },
) {
  try {
    const { leadId } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "opportunities", "view");

    const acl = await accountScopeFilter(user);
    const where = {
      tenantId: user.tenantId,
      leadId,
      deletedAt: null,
      ...(acl ?? {}),
    };

    const items = await db.qcfOpportunity.findMany({
      where,
      select: {
        id: true,
        name: true,
        stage: true,
        amount: true,
        currency: true,
        probability: true,
        weightedAmount: true,
        closeDate: true,
        accountId: true,
        ownerId: true,
        ownerName: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const data = items.map((it) => ({
      ...it,
      amount: it.amount == null ? null : toNumber(it.amount),
      weightedAmount: it.weightedAmount == null ? null : toNumber(it.weightedAmount),
      amountDisplay: formatGeneric(
        it.amount == null ? null : toNumber(it.amount),
        (it.currency ?? "INR").toUpperCase(),
      ),
    }));
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load opportunities";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    return err(message, status);
  }
}
