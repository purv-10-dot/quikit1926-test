import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
const auth = withOrgAuthForResource("orgSetup.units", "Unit");
import { validationError } from "@/lib/api/validationError";
import { updateUnitSchema } from "@/lib/schemas/unitSchema";
import { writeAuditLog } from "@/lib/api/auditLog";

type RouteParams = { id: string };

// Fixed org-level channel — keep in sync with app/api/units/route.ts.
const UNIT_AUDIT_ENTITY_ID = "unit-mgmt";
const auditFields = (u: Record<string, unknown>) => ({ name: u.name, description: u.description });

// PUT /api/units/[id] — rename / update a unit. Same (orgId, nameKey) uniqueness.
export const PUT = auth.update<RouteParams>(async ({ orgId, userId }, request, { params }) => {
  const existing = await db.unitMaster.findFirst({ where: { id: params.id, orgId } });
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const parsed = updateUnitSchema.safeParse(await request.json());
  if (!parsed.success) return validationError(parsed);
  const { name, description } = parsed.data;

  const trimmedName = name?.trim();

  try {
    const item = await db.unitMaster.update({
      where: { id: params.id },
      data: {
        name: trimmedName,
        nameKey: trimmedName !== undefined ? trimmedName.toLowerCase() : undefined,
        description: description?.trim() || null,
      },
    });
    await writeAuditLog({
      orgId,
      actorId: userId,
      action: "UPDATE",
      entityType: "Unit",
      entityId: UNIT_AUDIT_ENTITY_ID,
      oldValues: auditFields(existing),
      newValues: auditFields(item),
    });
    return NextResponse.json({ success: true, data: item });
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { success: false, error: "A unit with this name already exists." },
        { status: 409 },
      );
    }
    throw err;
  }
}, { fallbackErrorMessage: "Failed to update unit" });

// DELETE /api/units/[id] — delete a unit.
export const DELETE = auth.delete<RouteParams>(async ({ orgId, userId }, _request, { params }) => {
  const existing = await db.unitMaster.findFirst({ where: { id: params.id, orgId } });
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  await db.unitMaster.delete({ where: { id: params.id } });

  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "DELETE",
    entityType: "Unit",
    entityId: UNIT_AUDIT_ENTITY_ID,
    oldValues: auditFields(existing),
  });

  return NextResponse.json({ success: true });
}, { fallbackErrorMessage: "Failed to delete unit" });
