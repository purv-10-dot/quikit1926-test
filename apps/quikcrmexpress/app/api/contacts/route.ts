import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { accountScopeFilter, assertAccountAccess } from "@/lib/auth/account-acl";
import {
  createContactSchema,
  listContactsQuerySchema,
  SORTABLE_CONTACT_KEYS,
} from "@/lib/validators/contact";
import { normalizePhoneOrError } from "@/lib/services/shared/phone-normalize";
import { getWorkspacePhoneDefaultCountry } from "@/lib/services/workspace/phone-config";
import { findDuplicateContactByEmail } from "@/lib/services/contacts/duplicate-check";
import { attachAccountNames } from "@/lib/services/contacts/account-name-batch";
import { applyContactListWhere } from "@/lib/services/contacts/list-where";
import { resolveOwnerForTenant } from "@/lib/services/contacts/owner-resolve";
import {
  createPrismaCursorIterator,
  type PrismaListDelegate,
} from "@/lib/services/reports/prisma-cursor";
import {
  CONTACT_CSV_SELECT,
  contactCsvColumns,
  readTzFromCookieHeader,
  type ContactCsvRow,
} from "@/lib/services/reports/csv-columns";
import {
  dispatchExport,
  parseReportFormat,
} from "@/lib/services/reports/format-dispatch";
import { evaluateRulesForEvent } from "@/lib/notifications/rules/engine";

export const runtime = "nodejs";

function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ success: true, data }, init);
}
function fail(
  status: number,
  error: string,
  fieldErrors?: Record<string, string>,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error,
      ...(fieldErrors ? { fieldErrors, errors: fieldErrors } : {}),
      ...(extra ?? {}),
    },
    { status },
  );
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "contacts", "view");

    const { searchParams } = new URL(req.url);
    const parsed = listContactsQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return fail(400, "Invalid query", parsed.error.flatten().fieldErrors as Record<string, string>);
    }
    const q = parsed.data;

    if (q.trashed) {
      await assertModule(user, "contacts", "delete");
    }

    const acl = await accountScopeFilter(user);
    const where: Record<string, unknown> = { orgId: user.orgId };
    if (q.accountId) where.accountId = q.accountId;
    if (q.ownerId) where.ownerId = q.ownerId;
    if (q.q) {
      // Phone is stored E.164 (e.g. "+919876543210"); match on a digits-only
      // reduction of the query so "98765 43210" / "9876543210" still hit.
      // Text fields keep the raw-q insensitive contains.
      const digits = q.q.replace(/\D/g, "");
      const searchOr: Prisma.QceContactWhereInput[] = [
        { firstName: { contains: q.q, mode: "insensitive" } },
        { lastName: { contains: q.q, mode: "insensitive" } },
        { email: { contains: q.q, mode: "insensitive" } },
        { title: { contains: q.q, mode: "insensitive" } },
        { ownerName: { contains: q.q, mode: "insensitive" } },
        { city: { contains: q.q, mode: "insensitive" } },
      ];
      if (digits.length > 0) {
        searchOr.push({ phone: { contains: digits, mode: "insensitive" } });
      }
      where.OR = searchOr;
    }
    const scoped = applyContactListWhere(where, { trashed: q.trashed });
    const finalWhere: Record<string, unknown> = acl ? { AND: [scoped, acl] } : scoped;

    const format = parseReportFormat(searchParams);
    if (format) {
      const tz = readTzFromCookieHeader(req.headers.get("cookie"));
      const cursor = createPrismaCursorIterator<ContactCsvRow>({
        delegate: prisma.qceContact as unknown as PrismaListDelegate<ContactCsvRow>,
        where: finalWhere,
        select: CONTACT_CSV_SELECT,
      });
      return dispatchExport({
        format,
        user,
        cookieHeader: req.headers.get("cookie"),
        rows: cursor,
        columns: contactCsvColumns(tz),
        filenameStem: "contacts",
      });
    }

    const safeSortBy = SORTABLE_CONTACT_KEYS.has(q.sortBy) ? q.sortBy : "createdAt";
    // `id desc` tiebreaker → stable page boundaries when many rows share the same primary sort value.
    const orderBy =
      safeSortBy === "id"
        ? [{ id: q.sortDir }]
        : [{ [safeSortBy]: q.sortDir }, { id: "desc" as const }];

    const [rows, total] = await Promise.all([
      prisma.qceContact.findMany({
        where: finalWhere,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy,
      }),
      prisma.qceContact.count({ where: finalWhere }),
    ]);

    const items = await attachAccountNames(user.orgId, rows);
    const totalPages = Math.max(1, Math.ceil(total / q.pageSize));

    return ok({ items, total, page: q.page, pageSize: q.pageSize, totalPages });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list contacts";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/contacts GET]", error);
    return fail(status, message);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "contacts", "create");

    const body = await req.json().catch(() => null);
    const parsed = createContactSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        400,
        "Validation failed",
        parsed.error.flatten().fieldErrors as Record<string, string>,
      );
    }
    const data = parsed.data;

    if (data.accountId) await assertAccountAccess(user, data.accountId);

    if (data.email) {
      const dup = await findDuplicateContactByEmail(user.orgId, data.email);
      if (dup) {
        return fail(
          409,
          "A contact with this email already exists.",
          { email: "A contact with this email already exists." },
          { existingId: dup.id },
        );
      }
    }

    // Normalize phone to E.164 before write; reject invalid with the contacts
    // route's { success:false, ... } failure shape via fail(...).
    let phoneNorm: string | null = null;
    if (data.phone) {
      const defaultCountry = await getWorkspacePhoneDefaultCountry(user.orgId);
      const r = normalizePhoneOrError(data.phone, defaultCountry);
      if (!r.ok) return fail(400, "Validation failed", { phone: r.message });
      phoneNorm = r.value;
    }

    let ownerId = data.ownerId ?? null;
    let ownerName: string | null = null;
    if (ownerId) {
      const owner = await resolveOwnerForTenant(user.orgId, ownerId);
      ownerId = owner.ownerId;
      ownerName = owner.ownerName;
    } else {
      ownerId = user.userId;
      ownerName = user.name || user.email || null;
    }

    const created = await prisma.qceContact.create({
      data: {
        orgId: user.orgId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email ?? null,
        phone: phoneNorm,
        title: data.title ?? null,
        accountId: data.accountId ?? null,
        leadId: data.leadId ?? null,
        ownerId,
        ownerName,
        city: data.city ?? null,
        contactStage: data.contactStage ?? null,
        source: data.source ?? null,
      },
    });

    const [withName] = await attachAccountNames(user.orgId, [created]);
    evaluateRulesForEvent({
      event: "created",
      entityType: "contact",
      entityId: created.id,
      orgId: user.orgId,
      actorUserId: user.userId,
      actorName: user.name || user.email,
      after: withName as unknown as Record<string, unknown>,
      changedFields: [],
    }).catch((e) => console.error("[rules-engine] contact created", e));
    return ok(withName, { status: 201 });
  } catch (error: unknown) {
    const e = error as { statusCode?: number; fieldErrors?: Record<string, string> };
    const message = error instanceof Error ? error.message : "Failed to create contact";
    const status = e?.statusCode ?? 500;
    if (status >= 500) console.error("[api/contacts POST]", error);
    return fail(status, message, e?.fieldErrors);
  }
}
