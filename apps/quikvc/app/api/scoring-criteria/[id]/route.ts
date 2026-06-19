/**
 * Single scoring criterion — patch / delete.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { getVCRole, denyIfNotInRoles, FUND_ADMIN_ROLES } from "@/lib/rbac";

const patchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(1000).optional(),
  weight: z.number().int().min(0).max(100).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const PATCH = withOrgAuth(
  async ({ orgId, userId }, req: NextRequest, { params }: { params: { id: string } }) => {
    const denied = denyIfNotInRoles(await getVCRole(userId, orgId), FUND_ADMIN_ROLES);
    if (denied) return denied;

    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const c = await db.vCScoringCriterion.findFirst({
      where: { id: params.id, orgId },
      select: { id: true },
    });
    if (!c) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    await db.vCScoringCriterion.update({
      where: { id: c.id },
      data: { ...parsed.data, updatedBy: userId },
    });
    return NextResponse.json({ success: true });
  },
);

export const DELETE = withOrgAuth(
  async ({ orgId, userId }, _req: NextRequest, { params }: { params: { id: string } }) => {
    const denied = denyIfNotInRoles(await getVCRole(userId, orgId), FUND_ADMIN_ROLES);
    if (denied) return denied;

    const c = await db.vCScoringCriterion.findFirst({
      where: { id: params.id, orgId },
      select: { id: true },
    });
    if (!c) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    await db.vCScoringCriterion.delete({ where: { id: c.id } });
    return NextResponse.json({ success: true });
  },
);
