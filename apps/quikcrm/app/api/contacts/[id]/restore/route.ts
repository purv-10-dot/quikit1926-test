/**
 * POST /api/contacts/[id]/restore — restore a soft-deleted contact.
 */
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { attachAccountNames } from "@/lib/services/contacts/account-name-batch";

export const runtime = "nodejs";

function fail(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "contacts", "delete");

    const existing = await prisma.crmContact.findFirst({
      where: { id, orgId: user.orgId, deletedAt: { not: null } },
    });
    if (!existing) return fail(404, "Contact not found in trash");

    const restored = await prisma.crmContact.update({
      where: { id },
      data: { deletedAt: null },
    });
    const [withName] = await attachAccountNames(user.orgId, [restored]);
    return NextResponse.json({ success: true, data: withName });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Restore failed";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    return fail(status, message);
  }
}
