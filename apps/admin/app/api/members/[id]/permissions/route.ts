import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";
import { z } from "zod";

const VALID_PERMISSIONS = [
  "org.manage", "org.view", "members.manage", "members.invite",
  "teams.manage", "apps.manage", "settings.manage", "billing.manage",
] as const;

const permissionsSchema = z.object({
  customPermissions: z.array(z.enum(VALID_PERMISSIONS)),
});

export const PATCH = withAdminAuth<{ id: string }>(async ({ tenantId }, request: NextRequest, { params }) => {
  const blocked = await gateModuleApi("admin", "members", tenantId);
  if (blocked) return blocked as NextResponse;
  const membershipId = params.id;

  const membership = await db.membership.findFirst({
    where: { id: membershipId, tenantId },
  });

  if (!membership) {
    return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = permissionsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  const { customPermissions } = parsed.data;

  const updated = await db.membership.update({
    where: { id: membershipId },
    data: { customPermissions },
  });

  return NextResponse.json({ success: true, data: updated });
});
