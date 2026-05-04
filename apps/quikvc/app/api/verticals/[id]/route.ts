/**
 * Single vertical — patch / delete.
 *
 *   PATCH  /api/verticals/[id]  body { name?, description?, enabled?, sortOrder? }
 *   DELETE /api/verticals/[id]  — only allowed if no deals/applications reference it
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withTenantAuth } from "@/lib/api/withTenantAuth";
import { getVCRole, denyIfNotInRoles, FUND_ADMIN_ROLES } from "@/lib/rbac";

const patchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(2000).optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const PATCH = withTenantAuth(
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
    const v = await db.vCVertical.findFirst({
      where: { id: params.id, orgId },
      select: { id: true },
    });
    if (!v) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    await db.vCVertical.update({
      where: { id: v.id },
      data: { ...parsed.data, updatedBy: userId },
    });
    return NextResponse.json({ success: true });
  },
);

export const DELETE = withTenantAuth(
  async ({ orgId, userId }, _req: NextRequest, { params }: { params: { id: string } }) => {
    const denied = denyIfNotInRoles(await getVCRole(userId, orgId), FUND_ADMIN_ROLES);
    if (denied) return denied;

    const v = await db.vCVertical.findFirst({
      where: { id: params.id, orgId },
      include: { _count: { select: { applications: true, deals: true } } },
    });
    if (!v) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (v._count.applications > 0 || v._count.deals > 0) {
      return NextResponse.json(
        { success: false, error: "Cannot delete — vertical has applications or deals. Disable instead." },
        { status: 409 },
      );
    }
    await db.vCVertical.delete({ where: { id: v.id } });
    return NextResponse.json({ success: true });
  },
);
