import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { accountScopeFilter } from "@/lib/auth/account-acl";
import {
  contactFilterRequestSchema,
  SORTABLE_CONTACT_KEYS,
} from "@/lib/validators/contact";
import {
  buildContactSearchOr,
  translateContactFilterToPrismaWhere,
} from "@/lib/services/contacts/filter-engine";
import { attachAccountNames } from "@/lib/services/contacts/account-name-batch";
import { applyContactListWhere } from "@/lib/services/contacts/list-where";

export const runtime = "nodejs";

/**
 * POST /api/contacts/filter
 * Body: { filter: { matchMode, conditions[] }, page, pageSize, sortBy, sortDir }
 * Returns: { success, data: { items[], total, page, pageSize } }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "contacts", "view");

    const parsed = contactFilterRequestSchema.safeParse(
      await req.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid filter payload",
          fieldErrors: parsed.error.flatten().fieldErrors,
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }
    const { filter, page, pageSize, sortBy, sortDir, search, onlyDeleted } = parsed.data;
    if (onlyDeleted) {
      await assertModule(user, "contacts", "delete");
    }
    const filterWhere = translateContactFilterToPrismaWhere(filter);
    const acl = await accountScopeFilter(user);

    const baseAnd: Record<string, unknown>[] = [
      applyContactListWhere({ tenantId: user.tenantId }, { trashed: onlyDeleted }),
    ];
    if (Object.keys(filterWhere).length > 0) baseAnd.push(filterWhere);
    const searchOr = search?.trim() ? buildContactSearchOr(search.trim()) : [];
    if (searchOr.length > 0) baseAnd.push({ OR: searchOr });
    if (acl) baseAnd.push(acl);

    const where: Record<string, unknown> = { AND: baseAnd };

    const safeSortBy = SORTABLE_CONTACT_KEYS.has(sortBy) ? sortBy : "createdAt";
    const orderBy =
      safeSortBy === "id"
        ? [{ id: sortDir }]
        : [{ [safeSortBy]: sortDir }, { id: "desc" as const }];

    const [rows, total] = await Promise.all([
      prisma.crmContact.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy,
      }),
      prisma.crmContact.count({ where }),
    ]);

    const items = await attachAccountNames(user.tenantId, rows);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return NextResponse.json({
      success: true,
      data: { items, total, page, pageSize, totalPages },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to filter contacts";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/contacts/filter POST]", error);
    return NextResponse.json(
      { success: false, error: message },
      { status },
    );
  }
}
