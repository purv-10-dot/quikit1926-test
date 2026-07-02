import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule, maskHiddenLeadFields } from "@/lib/auth/permissions";
import { accountScopeFilter } from "@/lib/auth/account-acl";
import { leadFilterRequestSchema } from "@/lib/validators/lead-filter";
import { translateFilterToPrismaWhere } from "@/lib/services/leads/filter-engine";
import { listCustomFields } from "@/lib/services/fields/repo";

export const runtime = "nodejs";
const leadFilterSelect = {
  id: true,
  orgId: true,
  name: true,
  email: true,
  phone: true,
  mobile: true,
  company: true,
  jobTitle: true,
  source: true,
  stage: true,
  status: true,
  substatus: true,
  score: true,
  ownerId: true,
  ownerName: true,
  accountId: true,
  linkedContactId: true,
  externalId: true,
  sourceSystem: true,
  country: true,
  industry: true,
  secondaryEmail: true,
  website: true,
  linkedinUrl: true,
  annualRevenueDisplay: true,
  leadQuality: true,
  isDisengaged: true,
  isStarred: true,
  followupPriority: true,
  addressLine1: true,
  addressLine2: true,
  area: true,
  cityName: true,
  stateName: true,
  postalCode: true,
  lat: true,
  long: true,
  convertedAt: true,
  dynamicFields: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

/**
 * POST /api/leads/filter
 * Body: { filter: { matchMode, conditions[] }, page, pageSize, sortBy, sortDir }
 * Returns: { items[], total, page, pageSize }
 *
 * Parity: legacy POST /leads/filter — same payload shape and response shape.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "leads", "view");

    const parsed = leadFilterRequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid filter payload", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { filter, page, pageSize, sortBy, sortDir } = parsed.data;
    const customDefs = await listCustomFields(user.orgId);
    const filterWhere = translateFilterToPrismaWhere(filter, customDefs);
    const acl = await accountScopeFilter(user);

    const baseAnd: Record<string, unknown>[] = [{ orgId: user.orgId }];
    if (Object.keys(filterWhere).length > 0) baseAnd.push(filterWhere);
    if (acl) baseAnd.push(acl);

    // Soft-delete filter — applied EXPLICITLY at the top level of `where`.
    // CrmLead is not registered in the package-level soft-delete middleware,
    // so we must filter `deletedAt` here ourselves; otherwise trashed leads
    // leak back into the active list (and the Trash view double-counts them).
    //   ?onlyDeleted=true    → trash only   (deletedAt: { not: null })
    //   ?includeDeleted=true → both         (no deletedAt clause)
    //   default              → active only  (deletedAt: null)
    const where: Record<string, unknown> = { AND: baseAnd };
    const { searchParams } = new URL(req.url);
    if (searchParams.get("onlyDeleted") === "true") {
      where.deletedAt = { not: null };
    } else if (searchParams.get("includeDeleted") !== "true") {
      where.deletedAt = null;
    }

    // Converted leads are hidden from the active list by default (enterprise
    // CRM behavior — Salesforce/HubSpot/Zoho). End users reveal them via the
    // "Show Converted Leads" toggle, which sets ?includeConverted=true.
    //   default / false → exclude status="Converted"
    //   true            → include both active + converted
    // Administrators always see converted leads regardless of the param.
    // Skipped in trash view (a deleted lead's converted-ness is irrelevant there).
    const includeConverted =
      user.role === "Administrator" || searchParams.get("includeConverted") === "true";
    if (!includeConverted && searchParams.get("onlyDeleted") !== "true") {
      baseAnd.push({ NOT: { status: { equals: "Converted", mode: "insensitive" } } });
    }

    // Sorting is restricted to direct Lead columns. Dynamic (JSON) fields and unknown
    // keys silently fall back to createdAt desc — adding JSON-path ordering would
    // require a raw query and isn't supported in this iteration.
    const SORTABLE_KEYS = new Set([
      "createdAt", "updatedAt",
      "name", "email", "phone", "mobile", "company", "jobTitle", "source",
      "stage", "status", "score", "ownerName",
    ]);
    const safeSortBy = SORTABLE_KEYS.has(sortBy) ? sortBy : "createdAt";

    // `id desc` tiebreaker keeps page boundaries stable when many rows share
    // the same primary sort value.
    const orderBy =
      safeSortBy === "id"
        ? [{ id: sortDir }]
        : [{ [safeSortBy]: sortDir }, { id: "desc" as const }];

    const [items, total] = await Promise.all([
      prisma.crmLead.findMany({
        where,
        select: leadFilterSelect,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy,
      }),
      prisma.crmLead.count({ where }),
    ]);

    const masked = await Promise.all(items.map((l) => maskHiddenLeadFields(user, l)));
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return NextResponse.json({ items: masked, total, page, pageSize, totalPages });
  } catch (e) {
    return errorResponse(e);
  }
}
