import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { accountScopeFilter, assertAccountAccess } from "@/lib/auth/account-acl";
import {
  createOpportunitySchema,
  listQuerySchema,
} from "@/lib/services/opportunities/validators";
import {
  buildOpportunityListWhere,
  createOpportunity,
  listOpportunities,
} from "@/lib/services/opportunities/opportunity-service";
import { formatGeneric, toNumber } from "@/lib/services/opportunities/currency";
import {
  createPrismaCursorIterator,
  type PrismaListDelegate,
} from "@/lib/services/reports/prisma-cursor";
import {
  OPPORTUNITY_CSV_SELECT,
  opportunityCsvColumns,
  readTzFromCookieHeader,
  type OpportunityCsvRow,
} from "@/lib/services/reports/csv-columns";
import {
  dispatchExport,
  parseReportFormat,
} from "@/lib/services/reports/format-dispatch";
import { evaluateRulesForEvent } from "@/lib/notifications/rules/engine";
import { notifyOpportunityCreated } from "@/lib/notifications/opportunity-triggers";

export const runtime = "nodejs";

function err(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "opportunities", "view");

    const { searchParams } = new URL(req.url);
    const parsed = listQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return err(
        "Invalid query: " +
          parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        400,
      );
    }

    const acl = await accountScopeFilter(user);
    // ACL was set up but allow-list ended up empty → user sees nothing.
    if (acl && Array.isArray((acl as { OR?: unknown[] }).OR) === false) {
      return NextResponse.json({
        success: true,
        data: { items: [], total: 0, page: parsed.data.page, pageSize: parsed.data.pageSize, totalPages: 1 },
      });
    }

    const format = parseReportFormat(searchParams);
    if (format) {
      const tz = readTzFromCookieHeader(req.headers.get("cookie"));
      const where = buildOpportunityListWhere({
        tenantId: user.tenantId,
        trashed: parsed.data.trashed,
        leadId: parsed.data.leadId,
        stage: parsed.data.stage,
        ownerId: parsed.data.ownerId,
        accountId: parsed.data.accountId,
        q: parsed.data.q,
        aclFilter: acl,
      });
      const cursor = createPrismaCursorIterator<OpportunityCsvRow>({
        delegate: db.crmOpportunity as unknown as PrismaListDelegate<OpportunityCsvRow>,
        where,
        select: OPPORTUNITY_CSV_SELECT,
      });
      return dispatchExport({
        format,
        user,
        cookieHeader: req.headers.get("cookie"),
        rows: cursor,
        columns: opportunityCsvColumns(tz),
        filenameStem: "opportunities",
      });
    }

    const result = await listOpportunities({
      tenantId: user.tenantId,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      trashed: parsed.data.trashed,
      leadId: parsed.data.leadId,
      stage: parsed.data.stage,
      ownerId: parsed.data.ownerId,
      accountId: parsed.data.accountId,
      q: parsed.data.q,
      aclFilter: acl,
    });

    const items = result.items.map((it) => ({
      ...it,
      amount: it.amount == null ? null : toNumber(it.amount),
      weightedAmount: it.weightedAmount == null ? null : toNumber(it.weightedAmount),
      amountDisplay: formatGeneric(
        it.amount == null ? null : toNumber(it.amount),
        (it.currency ?? "INR").toUpperCase(),
      ),
    }));

    return NextResponse.json({
      success: true,
      data: {
        items,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list opportunities";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    return err(message, status);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "opportunities", "create");

    const body = await req.json().catch(() => null);
    const parsed = createOpportunitySchema.safeParse(body);
    if (!parsed.success) {
      return err(
        "Validation failed: " +
          parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        400,
      );
    }

    await assertAccountAccess(user, parsed.data.accountId);

    // Confirm the account exists in this tenant — assertAccountAccess only
    // checks scope, not existence.
    const account = await db.crmAccount.findFirst({
      where: { id: parsed.data.accountId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!account) return err("Account not found", 404);

    const created = await createOpportunity({
      tenantId: user.tenantId,
      userId: user.userId,
      input: parsed.data,
    });

    // Dedicated opportunity created notification (owner + managers).
    notifyOpportunityCreated({
      tenantId: user.tenantId,
      opportunityId: created.id,
      opportunityName: created.name,
      ownerId: created.ownerId,
      actorUserId: user.userId,
      actorName: user.name || user.email,
      amount: created.amount,
      currency: created.currency ?? "INR",
    }).catch((e) => console.error("[notifications] opportunity created", e));

    evaluateRulesForEvent({
      event: "created",
      entityType: "opportunity",
      entityId: created.id,
      tenantId: user.tenantId,
      actorUserId: user.userId,
      actorName: user.name || user.email,
      after: created as unknown as Record<string, unknown>,
      changedFields: [],
    }).catch((e) => console.error("[rules-engine] opportunity created", e));
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create opportunity";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    return err(message, status);
  }
}
