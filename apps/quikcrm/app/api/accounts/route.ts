/**
 * GET  /api/accounts — paginated list with search + ACL gate + soft-delete filter.
 *   Query: ?search&page&pageSize&trashed&view (all|mine).
 *   Always returns { data, total, page, pageSize } for consistent pagination.
 *
 * POST /api/accounts — create. ACL-restricted callers are rejected (matches the
 *   Nest backend's accounts.service.ts:54 throw — non-admins shouldn't be
 *   widening their own scope through creation).
 */
import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { getScope } from "@/lib/auth/account-acl";
import { createAccountSchema, listAccountsQuerySchema } from "@/lib/validators/account";
import {
  buildAccountSearchOr,
  findManyAccountRows,
  createAccountRow,
  applyAccountListWhere,
  formatRevenueDisplay,
  parseRevenueDisplay,
  segmentEnumToLabel,
  slugifyIndustry,
  deriveOwnerName,
  writeAccountActivity,
} from "@/lib/services/accounts";
import {
  createPrismaCursorIterator,
  type PrismaListDelegate,
} from "@/lib/services/reports/prisma-cursor";
import {
  ACCOUNT_CSV_SELECT,
  accountCsvColumns,
  readTzFromCookieHeader,
  type AccountCsvRow,
} from "@/lib/services/reports/csv-columns";
import {
  dispatchExport,
  parseReportFormat,
} from "@/lib/services/reports/format-dispatch";

export const runtime = "nodejs";    

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "accounts", "view");

    const { searchParams } = new URL(req.url);
    const parsed = listAccountsQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { search, page, pageSize, trashed, view } = parsed.data;

    if (trashed) {
      await assertModule(user, "accounts", "delete");
    }

    const scope = await getScope(user);
    let allowedAccountIds: string[] | null = null;
    if (!scope.unrestricted) {
      if (scope.allowedAccountIds.length === 0) {
        return NextResponse.json({ data: [], total: 0, page, pageSize, totalPages: 1 });
      }
      allowedAccountIds = scope.allowedAccountIds;
    }

    const where: Prisma.CrmAccountWhereInput = applyAccountListWhere(
      { orgId: user.orgId },
      {
        trashed,
        allowedAccountIds,
        viewMine: view === "mine" ? { ownerId: user.userId } : null,
      },
    );

    if (search?.trim()) {
      const ors = buildAccountSearchOr(search);
      if (ors.length > 0) where.OR = ors;
    }

    const format = parseReportFormat(searchParams);
    if (format) {
      const tz = readTzFromCookieHeader(req.headers.get("cookie"));
      const cursor = createPrismaCursorIterator<AccountCsvRow>({
        delegate: prisma.crmAccount as unknown as PrismaListDelegate<AccountCsvRow>,
        where,
        select: ACCOUNT_CSV_SELECT,
      });
      return dispatchExport({
        format,
        user,
        cookieHeader: req.headers.get("cookie"),
        rows: cursor,
        columns: accountCsvColumns(tz),
        filenameStem: "accounts",
      });
    }

    // "My accounts" sorts by renewalDate ASC NULLS LAST; otherwise alpha by name.
    // `id desc` tiebreaker → stable page boundaries when many rows share the same
    // primary sort value (lots of accounts named "Acme" or with the same renewalDate).
    const orderBy: Prisma.CrmAccountOrderByWithRelationInput[] =
      view === "mine"
        ? [{ renewalDate: { sort: "asc", nulls: "last" } }, { name: "asc" }, { id: "desc" }]
        : [{ name: "asc" }, { id: "desc" }];

    const [rows, total] = await Promise.all([
      findManyAccountRows({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.crmAccount.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return NextResponse.json({ data: rows, total, page, pageSize, totalPages });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "accounts", "create");

    const scope = await getScope(user);
    if (!scope.unrestricted) {
      const err = new Error(
        "Account creation is restricted by account ACL — contact your admin to expand access",
      ) as Error & { statusCode?: number };
      err.statusCode = 403;
      throw err;
    }

    const body = await req.json().catch(() => null);
    const parsed = createAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const dto = parsed.data;

    // Derive ownerName, populate display revenue when amount is set, slugify industry,
    // sync segment label from segmentEnum if both are set.
    const ownerName = await deriveOwnerName(dto.ownerId);
    const display =
      dto.annualRevenueDisplay ||
      formatRevenueDisplay(dto.annualRevenueAmount, dto.annualRevenueCurrency ?? "INR");
    const parsed2 =
      !dto.annualRevenueAmount && dto.annualRevenueDisplay
        ? parseRevenueDisplay(dto.annualRevenueDisplay)
        : null;
    const segmentText =
      dto.segment ||
      (dto.segmentEnum ? (segmentEnumToLabel(dto.segmentEnum) ?? null) : null);

    const created = await createAccountRow({
      data: {
        orgId: user.orgId,
        name: dto.name,
        segment: segmentText,
        segmentEnum: dto.segmentEnum ?? null,
        ownerId: dto.ownerId ?? null,
        ownerName,
        industry: dto.industry ?? null,
        industryKey: slugifyIndustry(dto.industry),
        website: dto.website ?? null,
        city: dto.city ?? null,
        status: dto.status ?? "Active",
        annualRevenueDisplay: display,
        annualRevenueAmount: dto.annualRevenueAmount ?? parsed2?.amount ?? null,
        annualRevenueCurrency:
          dto.annualRevenueCurrency ?? parsed2?.currency ?? "INR",
        countryCode: dto.countryCode ?? null,
        state: dto.state ?? null,
        postalCode: dto.postalCode ?? null,
        parentAccountId: dto.parentAccountId ?? null,
        healthScore: dto.healthScore ?? null,
        contractStart: dto.contractStart ?? null,
        contractEnd: dto.contractEnd ?? null,
        renewalDate: dto.renewalDate ?? null,
        npsScore: dto.npsScore ?? null,
        createdByUserId: user.userId,
      },
    });

    await writeAccountActivity({
      orgId: user.orgId,
      accountId: created.id,
      accountName: created.name,
      outcome: `Account created${ownerName ? ` · Owner: ${ownerName}` : ""}`,
      ownerName: user.name || null,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
