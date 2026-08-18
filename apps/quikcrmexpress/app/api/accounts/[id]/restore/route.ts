/**
 * POST /api/accounts/[id]/restore — un-soft-delete an account.
 * Permission: Accounts.delete (matches the symmetry of DELETE).
 */
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { assertAccountAccess } from "@/lib/auth/account-acl";
import { updateAccountRow } from "@/lib/services/accounts";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "accounts", "delete");
    await assertAccountAccess(user, id);

    const existing = await prisma.qceAccount.findFirst({
      where: { id, orgId: user.orgId, deletedAt: { not: null } },
      select: { id: true, name: true },
    });
    if (!existing) return NextResponse.json({ success: false, error: "Not found in trash" }, { status: 404 });

    const restored = await updateAccountRow({
      where: { id },
      data: { deletedAt: null },
    });
    await prisma.qceActivity.create({
      data: {
        orgId: user.orgId,
        type: "AccountChange",
        relatedKind: "Account",
        relatedObjectId: id,
        subject: `Account · ${existing.name}`,
        outcome: "Restored from trash",
        ownerName: user.name || null,
        occurredAt: new Date(),
      },
    });

    return NextResponse.json(restored);
  } catch (e) {
    return errorResponse(e);
  }
}
