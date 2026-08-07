/**
 * POST /api/accounts/filter — paginated advanced filter.
 * Mirrors quikcrm-backend/src/accounts/accounts.service.ts::findWithFilters.
 *
 * Body: { conditions: [...], combinator: "AND"|"OR", page, limit, topLevelOnly }.
 * Each condition is { field, operator, value?, values? }.
 */
import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { getScope } from "@/lib/auth/account-acl";
import { filterAccountsSchema } from "@/lib/validators/account";
import {
  findManyAccountRows,
  buildAccountSearchOr,
  buildAdvancedAccountWhere,
  applyAccountListWhere,
} from "@/lib/services/accounts";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "accounts", "view");

    const parsed = filterAccountsSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { conditions, combinator, page, pageSize, topLevelOnly, search } = parsed.data;

    const scope = await getScope(user);
    let allowedAccountIds: string[] | null = null;
    if (!scope.unrestricted) {
      if (scope.allowedAccountIds.length === 0) {
        return NextResponse.json({ data: [], total: 0, page, pageSize, totalPages: 1 });
      }
      allowedAccountIds = scope.allowedAccountIds;
    }

    const baseWhere: Prisma.QcfAccountWhereInput = applyAccountListWhere(
      { orgId: user.orgId },
      { trashed: false, allowedAccountIds, viewMine: null },
    );

    const advanced = buildAdvancedAccountWhere(conditions, combinator);
    const searchOr = search?.trim() ? buildAccountSearchOr(search.trim()) : [];
    const andParts: Prisma.QcfAccountWhereInput[] = [baseWhere];
    if (advanced) andParts.push(advanced);
    if (searchOr.length > 0) andParts.push({ OR: searchOr });
    const where: Prisma.QcfAccountWhereInput =
      andParts.length === 1 ? andParts[0]! : { AND: andParts };
    if (topLevelOnly) {
      // Wrap once more so the existing AND list (if any) is preserved.
      Object.assign(where, {
        AND: [
          ...((where.AND as Prisma.QcfAccountWhereInput[] | undefined) ?? [where]),
          { parentAccountId: null },
        ],
      });
    }

    const [rows, total] = await Promise.all([
      findManyAccountRows({
        where,
        orderBy: [{ name: "asc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.qcfAccount.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return NextResponse.json({ data: rows, total, page, pageSize, totalPages });
  } catch (e) {
    return errorResponse(e);
  }
}
