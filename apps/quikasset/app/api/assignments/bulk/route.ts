import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { resolveAssigneeEmployeeId } from "@/lib/api/resolveAssignee";
import { MAX_BULK_ASSIGN, findDuplicateAssetId, partitionAssignable } from "@/lib/api/assignmentBulk";

const auth = withOrgAuthForResource("Assignment");

const bulkSchema = z.object({
  userId: z.string().min(1, "An assignee is required"),
  assetIds: z
    .array(z.string().min(1))
    .min(1, "Select at least one asset")
    .max(MAX_BULK_ASSIGN, `At most ${MAX_BULK_ASSIGN} assets per bulk assignment`),
  assignedDate: z.string().trim().min(1, "Assigned date is required"),
  expectedReturn: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

/**
 * Atomic bulk assign: many assets → one person. Validates the whole batch
 * (assignee resolvable, no duplicate asset, every asset present + Available)
 * BEFORE writing, then creates every assignment and flips every asset to
 * Assigned in a single transaction — so a stolen/unavailable asset never leaves
 * a half-assigned batch behind. Each assignment inherits its asset's condition.
 */
export const POST = auth.create(async ({ orgId, userId: actorId, userEmail }, req) => {
  const parsed = bulkSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const { userId, assetIds, assignedDate, expectedReturn, notes } = parsed.data;

  // 1. Same asset picked twice.
  const dup = findDuplicateAssetId(assetIds);
  if (dup) {
    return NextResponse.json({ success: false, error: "The same asset is selected more than once." }, { status: 409 });
  }

  // 2. Resolve the assignee once (platform User.id → AstEmployee.id, auto-linking
  //    the identity bridge on first assignment).
  const resolved = await resolveAssigneeEmployeeId({ orgId, ref: userId });
  if ("error" in resolved) return resolved.error;
  const employeeId = resolved.employeeId;

  // 3. Validate EVERY asset before writing anything (all-or-nothing).
  const assets = await db.astAsset.findMany({
    where: { orgId, id: { in: assetIds } },
    select: { id: true, assetStatus: true, condition: true, itemName: true },
  });
  const { missing, unavailable, assignable } = partitionAssignable(assetIds, assets);
  if (missing.length > 0) {
    return NextResponse.json({ success: false, error: "One or more selected assets were not found." }, { status: 404 });
  }
  if (unavailable.length > 0) {
    const names = unavailable.map((a) => `${a.itemName} (${a.assetStatus})`).join(", ");
    return NextResponse.json(
      { success: false, error: `These assets are no longer Available: ${names}. Refresh and try again.` },
      { status: 409 },
    );
  }

  // 4. Create every assignment + flip every asset atomically.
  const created = await db.$transaction(async (tx) => {
    const rows = [];
    for (const a of assignable) {
      const row = await tx.astAssignment.create({
        data: {
          orgId,
          assetId: a.id,
          userId: employeeId,
          condition: a.condition || "Good", // inherit the asset's own condition
          assignedAt: new Date(assignedDate),
          expectedReturn: expectedReturn || null,
          notes: notes || null,
        },
        include: {
          asset: { include: { baseCategory: true, category: true } },
          user: true,
        },
      });
      rows.push(row);
    }
    await tx.astAsset.updateMany({
      where: { id: { in: assignable.map((a) => a.id) } },
      data: { assetStatus: "Assigned" },
    });
    return rows;
  });

  await audit({
    orgId,
    module: "Assignments",
    action: "Assets Bulk Assigned",
    entityId: created[0]?.id ?? "bulk",
    entityName: `${created.length} assets → ${created[0]?.user?.name ?? "employee"}`,
    details: `${created.length} assets assigned`,
    actorId,
    actorEmail: userEmail,
  });

  return NextResponse.json({ success: true, data: created }, { status: 201 });
});
