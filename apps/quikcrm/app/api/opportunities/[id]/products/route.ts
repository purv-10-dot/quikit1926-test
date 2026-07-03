import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { assertAccountAccess } from "@/lib/auth/account-acl";
import { productSchema } from "@/lib/services/opportunities/validators";
import { recalculateFromProducts } from "@/lib/services/opportunities/opportunity-service";
import { computeProductLineTotal } from "@/lib/services/opportunities/compute";
import { toNumber } from "@/lib/services/opportunities/currency";

export const runtime = "nodejs";

function err(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

async function loadOpp(orgId: string, id: string) {
  return db.crmOpportunity.findFirst({
    where: { id, orgId },
    select: { id: true, accountId: true, ownerId: true },
  });
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

    const opp = await loadOpp(user.orgId, id);
    if (!opp) return err("Not found", 404);
    await assertAccountAccess(user, opp.accountId, { recordOwnerId: opp.ownerId });

    const products = await db.crmOpportunityProduct.findMany({
      where: { orgId: user.orgId, opportunityId: id },
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json({
      success: true,
      data: products.map((p) => ({
        ...p,
        unitPrice: toNumber(p.unitPrice),
        lineTotal: toNumber(p.lineTotal),
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load products";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    return err(message, status);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "opportunities", "edit");

    const opp = await loadOpp(user.orgId, id);
    if (!opp) return err("Not found", 404);
    await assertAccountAccess(user, opp.accountId, { recordOwnerId: opp.ownerId });

    const body = await req.json().catch(() => null);
    const parsed = productSchema.safeParse(body);
    if (!parsed.success) {
      return err(
        "Validation failed: " +
          parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        400,
      );
    }

    const lineTotal = computeProductLineTotal(
      parsed.data.quantity,
      parsed.data.unitPrice,
      parsed.data.discountPct,
    );

    const created = await db.crmOpportunityProduct.create({
      data: {
        orgId: user.orgId,
        opportunityId: id,
        productName: parsed.data.productName,
        quantity: parsed.data.quantity,
        unitPrice: parsed.data.unitPrice,
        discountPct: parsed.data.discountPct,
        lineTotal,
        notes: parsed.data.notes ?? null,
        sortOrder: parsed.data.sortOrder ?? 0,
      },
    });
    return NextResponse.json(
      {
        success: true,
        data: {
          ...created,
          unitPrice: toNumber(created.unitPrice),
          lineTotal: toNumber(created.lineTotal),
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to add product";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    return err(message, status);
  }
}

/** PUT /products?recalc=true triggers Σ lineTotal → opp.amount sync. */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "opportunities", "edit");

    const opp = await loadOpp(user.orgId, id);
    if (!opp) return err("Not found", 404);
    await assertAccountAccess(user, opp.accountId, { recordOwnerId: opp.ownerId });

    const result = await recalculateFromProducts(user.orgId, id);
    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to recalculate";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    return err(message, status);
  }
}
