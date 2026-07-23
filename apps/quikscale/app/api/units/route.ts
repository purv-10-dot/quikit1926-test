import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
const auth = withOrgAuthForResource("orgSetup.units", "Unit");
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { validationError } from "@/lib/api/validationError";
import { createUnitSchema } from "@/lib/schemas/unitSchema";
import { writeAuditLog } from "@/lib/api/auditLog";
import { unitNameConflictMessage } from "@/lib/api/unitConflict";

// Fixed org-level channel so all unit audit entries list together (mirrors
// the category-mgmt pattern). Keep in sync with units/[id]/route.ts.
const UNIT_AUDIT_ENTITY_ID = "unit-mgmt";

// Sortable columns — allow-list keyed by the FeatureGrid column key.
const UNIT_SORT_MAP: Record<string, string> = {
  name: "name",
  description: "description",
  createdAt: "createdAt",
};

// GET /api/units — list units for the tenant. Server pagination + search + sort
// + the Trash view (includeDeleted).
export const GET = auth.view(async ({ orgId }, request) => {
  const sp = request.nextUrl.searchParams;
  const search = sp.get("search") || undefined;
  const includeDeleted = sp.get("includeDeleted") === "true";
  const sortBy = sp.get("sortBy") || "";
  const sortOrder = sp.get("sortOrder") === "desc" ? "desc" : "asc";
  const { page, limit, skip, take } = parsePagination(request);

  const where: Record<string, unknown> = { orgId };
  where.deletedAt = includeDeleted ? { not: null } : null;
  if (search) where.name = { contains: search, mode: "insensitive" };

  const sortCol = UNIT_SORT_MAP[sortBy];
  const orderBy = sortCol
    ? [{ [sortCol]: sortOrder }, { id: "asc" as const }]
    : [{ position: "asc" as const }, { name: "asc" as const }];

  const [items, total] = await Promise.all([
    db.unitMaster.findMany({ where, orderBy, skip, take }),
    db.unitMaster.count({ where }),
  ]);

  return NextResponse.json(paginatedResponse(items, total, page, limit));
}, { fallbackErrorMessage: "Failed to fetch units" });

// POST /api/units — create a unit. Duplicate (orgId, lowercased name) → 409.
export const POST = auth.create(async ({ orgId, userId }, request) => {
  const parsed = createUnitSchema.safeParse(await request.json());
  if (!parsed.success) return validationError(parsed);
  const { name, description } = parsed.data;

  const trimmedName = name.trim();

  try {
    const item = await db.unitMaster.create({
      data: {
        orgId,
        name: trimmedName,
        nameKey: trimmedName.toLowerCase(),
        description: description?.trim() || null,
        createdBy: userId,
      },
    });
    await writeAuditLog({
      orgId,
      actorId: userId,
      action: "CREATE",
      entityType: "Unit",
      entityId: UNIT_AUDIT_ENTITY_ID,
      newValues: { name: item.name, description: item.description },
      changes: ["name", "description"],
    });
    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        { success: false, error: await unitNameConflictMessage(orgId, trimmedName) },
        { status: 409 },
      );
    }
    throw err;
  }
}, { fallbackErrorMessage: "Failed to create unit" });

// Prisma P2002 = unique constraint violation
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}
