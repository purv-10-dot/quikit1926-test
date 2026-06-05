/**
 * DELETE /api/contacts/trash — permanently delete all trashed contacts (admin only).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_ROLE = "Administrator";

export async function DELETE() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "contacts", "delete");

    if (user.role !== ADMIN_ROLE) {
      return NextResponse.json(
        { success: false, error: "Empty trash is restricted to administrators." },
        { status: 403 },
      );
    }

    const trashed = await prisma.crmContact.findMany({
      where: { orgId: user.orgId, deletedAt: { not: null } },
      select: { id: true, leadId: true },
    });

    if (trashed.length === 0) {
      return NextResponse.json({ success: true, data: { count: 0 } });
    }

    const contactIds = trashed.map((c) => c.id);
    const leadIds = trashed.map((c) => c.leadId).filter((id): id is string => !!id);

    await prisma.$transaction(async (tx) => {
      await tx.crmLead.updateMany({
        where: {
          orgId: user.orgId,
          OR: [
            { linkedContactId: { in: contactIds } },
            ...(leadIds.length > 0 ? [{ id: { in: leadIds } }] : []),
          ],
        },
        data: { status: "Open", convertedAt: null, linkedContactId: null },
      });
      await tx.crmContact.deleteMany({
        where: { orgId: user.orgId, id: { in: contactIds } },
      });
    });

    return NextResponse.json({ success: true, data: { count: trashed.length } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Empty trash failed";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/contacts/trash DELETE]", error);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
