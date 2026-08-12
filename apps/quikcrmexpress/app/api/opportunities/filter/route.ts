import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { accountScopeFilter } from "@/lib/auth/account-acl";
import { filterOpportunitiesSchema } from "@/lib/services/opportunities/validators";
import { buildOpportunityFilterWhere } from "@/lib/services/opportunities/filter-engine";
import { formatGeneric, toNumber } from "@/lib/services/opportunities/currency";

export const runtime = "nodejs";

function err(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "opportunities", "view");

    const body = await req.json().catch(() => ({}));
    const parsed = filterOpportunitiesSchema.safeParse(body);
    if (!parsed.success) {
      return err(
        "Validation failed: " +
          parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        400,
      );
    }

    const { conditions, combinator, page, pageSize, search } = parsed.data;
    const acl = await accountScopeFilter(user);

    if (acl && Array.isArray((acl as { OR?: unknown[] }).OR) === false) {
      return NextResponse.json({
        success: true,
        data: { items: [], total: 0, page, pageSize, totalPages: 1 },
      });
    }

    const where = buildOpportunityFilterWhere({
      orgId: user.orgId,
      aclFilter: acl,
      conditions,
      combinator,
      search,
    });

    const [items, total] = await Promise.all([
      db.qceOpportunity.findMany({
        where,
        select: {
          id: true,
          name: true,
          accountId: true,
          account: { select: { id: true, name: true } },
          stage: true,
          amount: true,
          currency: true,
          probability: true,
          weightedAmount: true,
          closeDate: true,
          ownerId: true,
          ownerName: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.qceOpportunity.count({ where }),
    ]);

    const data = items.map((it) => ({
      ...it,
      amount: it.amount == null ? null : toNumber(it.amount),
      weightedAmount: it.weightedAmount == null ? null : toNumber(it.weightedAmount),
      amountDisplay: formatGeneric(
        it.amount == null ? null : toNumber(it.amount),
        (it.currency ?? "INR").toUpperCase(),
      ),
    }));

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return NextResponse.json({
      success: true,
      data: { items: data, total, page, pageSize, totalPages },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Filter query failed";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    return err(message, status);
  }
}
