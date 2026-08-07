/**
 * POST /api/accounts/[id]/leads/bulk-assign — single-transaction lead reassignment.
 * Body: { leadIds: string[], ownerId: string }.
 *
 * Replaces the React detail page's `for (id of selectedLeadIds) await patchLead(id, …)`
 * loop (N round-trips). Writes ONE BulkOwnershipChange activity describing the op.
 * Permissions: Leads.edit + account ACL (same gate as PATCH /api/leads/[id]).
 */
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { triggerOutboundSync } from "@/lib/services/leadsquared/outbound-trigger";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { assertAccountAccess } from "@/lib/auth/account-acl";
import { bulkAssignLeadsSchema } from "@/lib/validators/account";
import { deriveOwnerName } from "@/lib/services/accounts";
import { recordLeadChange } from "@/lib/services/leads/change-log";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: accountId } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "leads", "edit");
    await assertAccountAccess(user, accountId);

    const parsed = bulkAssignLeadsSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { leadIds, ownerId } = parsed.data;

    const ownerName = (await deriveOwnerName(ownerId)) ?? "";
    if (!ownerName) {
      return NextResponse.json({ error: "Owner user not found" }, { status: 400 });
    }

    const targets = await prisma.qcfLead.findMany({
      where: {
        id: { in: leadIds },
        tenantId: user.tenantId,
        accountId,
        deletedAt: null,
      },
      select: { id: true, ownerId: true, ownerName: true },
    });
    if (targets.length === 0) {
      return NextResponse.json(
        { error: "No matching leads on this account (check selection and try again)." },
        { status: 400 },
      );
    }

    const targetIds = targets.map((t) => t.id);

    const [result] = await prisma.$transaction([
      prisma.qcfLead.updateMany({
        where: { id: { in: targetIds }, tenantId: user.tenantId },
        data: { ownerId, ownerName },
      }),
      prisma.qcfActivity.create({
        data: {
          tenantId: user.tenantId,
          type: "BulkOwnershipChange",
          relatedKind: "Account",
          relatedObjectId: accountId,
          subject: `Bulk reassign · ${targetIds.length} lead(s)`,
          outcome: `Assigned ${targetIds.length} lead(s) to ${ownerName}`,
          ownerName: user.name || null,
          occurredAt: new Date(),
        },
      }),
    ]);

    // Outbound sync per reassigned lead (owner change), AFTER the tx committed.
    // Fire-and-forget. NOTE: fans out one job per lead — a very large bulk
    // assign enqueues many jobs; throttling may be needed later (not built now).
    for (const id of targetIds) {
      triggerOutboundSync({ tenantId: user.tenantId, crmLeadId: id });
    }

    await Promise.all(
      targets.map((before) =>
        recordLeadChange({
          tenantId: user.tenantId,
          userId: user.userId,
          leadId: before.id,
          action: "UPDATE",
          before: before as unknown as Record<string, unknown>,
          after: { ...before, ownerId, ownerName } as unknown as Record<string, unknown>,
        }).catch((err: unknown) => {
          console.error("[bulk-assign] change log failed", err);
        }),
      ),
    );

    return NextResponse.json({ success: true, updated: result.count });
  } catch (e) {
    return errorResponse(e);
  }
}
