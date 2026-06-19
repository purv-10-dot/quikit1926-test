import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

// RBAC v2: toggling active/inactive is a mutation on the membership record,
// gated by `User.update`. Admin role bypass is handled inside `userCan()`.
const auth = withOrgAuthForResource("orgSetup.users", "User");

const bodySchema = z.object({
  status: z.enum(["active", "inactive"]),
});

// PATCH /api/org/users/[id]/status
// Toggle a user's membership status (active / inactive). Inactive users
// keep their data but lose the ability to sign in to this tenant.
export const PATCH = auth.update<{ id: string }>(async ({ orgId }, req, { params }) => {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    const membership = await db.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId: params.id } },
      select: { id: true },
    });
    if (!membership) {
      return NextResponse.json({ success: false, error: "User not in organisation" }, { status: 404 });
    }

    const updated = await db.orgMember.update({
      where: { id: membership.id },
      data: { status: parsed.data.status },
      select: { id: true, userId: true, status: true },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update status";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
