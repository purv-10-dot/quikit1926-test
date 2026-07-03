import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { assertAccountAccess } from "@/lib/auth/account-acl";
import { restore } from "@/lib/services/opportunities/opportunity-service";

export const runtime = "nodejs";

function err(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    // Spec ties restore to delete capability — only someone who could trash
    // it can restore it.
    await assertModule(user, "opportunities", "delete");

    // findUnique (not findFirst) so the soft-delete middleware does not
    // filter out the trashed row we're trying to restore. Mirrors the
    // leads-restore pattern at app/api/leads/[id]/restore/route.ts:27.
    // Tenant check runs post-lookup since findUnique only accepts unique
    // fields in `where`.
    const opp = await db.crmOpportunity.findUnique({
      where: { id },
      select: { id: true, orgId: true, accountId: true, ownerId: true, deletedAt: true },
    });
    if (!opp || opp.orgId !== user.orgId) return err("Not found", 404);
    await assertAccountAccess(user, opp.accountId, { recordOwnerId: opp.ownerId });
    if (!opp.deletedAt) return err("Opportunity is not in trash", 400);

    await restore(user.orgId, id);
    return NextResponse.json({ success: true, data: { id, restored: true } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to restore opportunity";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    return err(message, status);
  }
}
