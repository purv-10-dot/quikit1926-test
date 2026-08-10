import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { assertAccountAccess } from "@/lib/auth/account-acl";
import { updateActivitySchema } from "@/lib/validators/activity";
import {
  assertActivityTargetExists,
  getRelatedAccountId,
} from "@/lib/services/activities/target-existence";
import { toListRow } from "@/lib/services/activities/to-list-row";
import { readTzFromCookieHeader } from "@/lib/services/reports/csv-columns";

export const runtime = "nodejs";

async function loadAndAssertAccess(
  orgId: string,
  id: string,
  user: Parameters<typeof assertAccountAccess>[0],
) {
  const item = await prisma.qcfActivity.findFirst({ where: { id, orgId } });
  if (!item) {
    const err = new Error("Activity not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }
  // Soft-orphaned rows skip ACL — they're audit trail and visible to anyone
  // with the activities:view perm.
  if (!item.relatedOrphanedAt) {
    const accountId = await getRelatedAccountId(orgId, item.relatedKind, item.relatedObjectId);
    await assertAccountAccess(user, accountId);
  }
  return item;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "activities", "view");
    const item = await loadAndAssertAccess(user.orgId, id, user);
    const tz = readTzFromCookieHeader(_req.headers.get("cookie"));
    const row = await toListRow(user.orgId, item, tz);
    return NextResponse.json({ success: true, data: row });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "activities", "edit");

    const existing = await loadAndAssertAccess(user.orgId, id, user);

    const parsed = updateActivitySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid body",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }
    const dto = parsed.data;

    if (dto.ownerId && dto.ownerId !== user.userId) {
      await assertModule(user, "activities", "edit");
    }

    // Re-validate target if relatedKind or relatedObjectId changed.
    const newKind = dto.relatedKind ?? existing.relatedKind;
    const newId = dto.relatedObjectId ?? existing.relatedObjectId;
    if (newKind !== existing.relatedKind || newId !== existing.relatedObjectId) {
      await assertActivityTargetExists(user.orgId, newKind, newId);
      const newAccount = await getRelatedAccountId(user.orgId, newKind, newId);
      await assertAccountAccess(user, newAccount);
    }

    const data: Record<string, unknown> = { ...dto };
    if (dto.occurredAt) data.occurredAt = new Date(dto.occurredAt);
    if (dto.followUpAt) data.followUpAt = new Date(dto.followUpAt);

    const updated = await prisma.qcfActivity.update({
      where: { id },
      data: data as Parameters<typeof prisma.qcfActivity.update>[0]["data"],
    });
    const tz = readTzFromCookieHeader(req.headers.get("cookie"));
    const row = await toListRow(user.orgId, updated, tz);
    return NextResponse.json({ success: true, data: row });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "activities", "delete");
    await loadAndAssertAccess(user.orgId, id, user);
    await prisma.qcfActivity.delete({ where: { id } });
    return NextResponse.json({ success: true, data: { ok: true } });
  } catch (e) {
    return errorResponse(e);
  }
}
