import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule, maskHiddenLeadFields, filterRestrictedLeadFields } from "@/lib/auth/permissions";
import { assertAccountAccess } from "@/lib/auth/account-acl";
import { updateLeadSchema } from "@/lib/validators/lead";
import { onLeadUpdated } from "@/lib/services/automation/triggers";
import { publishLeadEvent } from "@/lib/services/leads/realtime";
import { recordLeadChange } from "@/lib/services/leads/change-log";
import { listLeadFields } from "@/lib/services/fields/repo";
import { validateDynamicFields } from "@/lib/services/fields/validate";
import { updateCrmLead } from "@/lib/services/leads/create-record";
import {
  shouldUseAutoLeadScore,
  syncLeadScoreAfterChange,
} from "@/lib/services/leads/lead-scoring/integration";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "leads", "view");
    // findUnique bypasses the soft-delete middleware so deleted leads can be
    // viewed in read-only mode (URL access, restore flow). The response carries
    // the `deletedAt` timestamp so the client can render the read-only banner.
    const lead = await prisma.crmLead.findUnique({ where: { id } });
    if (!lead || lead.tenantId !== user.tenantId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await assertAccountAccess(user, lead.accountId);
    return NextResponse.json(await maskHiddenLeadFields(user, lead));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "leads", "edit");
    const existing = await prisma.crmLead.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== user.tenantId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing.deletedAt) {
      return NextResponse.json(
        { error: "Lead is in trash. Restore it before editing." },
        { status: 410 },
      );
    }
    await assertAccountAccess(user, existing.accountId);

    const body = await req.json().catch(() => null);
    const parsed = updateLeadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const data = await filterRestrictedLeadFields(user, parsed.data);
    if (data.accountId) await assertAccountAccess(user, data.accountId);

    // Merge dynamicFields: existing values + incoming patch (incoming wins). Validate against defs.
    let mergedDyn: Record<string, unknown> | undefined;
    if (data.dynamicFields !== undefined) {
      const defs = await listLeadFields(user.tenantId);
      const incoming = (data.dynamicFields ?? {}) as Record<string, unknown>;
      const existingDyn = (existing.dynamicFields as Record<string, unknown> | null) ?? {};
      const mergedInput = { ...existingDyn, ...incoming };
      const { values, errors: dynErrors } = validateDynamicFields({
        defs,
        input: mergedInput,
        requireMissing: false, // partial updates don't enforce required-on-empty
      });
      if (Object.keys(dynErrors).length > 0) {
        return NextResponse.json({ error: "Validation failed", errors: dynErrors }, { status: 400 });
      }
      mergedDyn = values;
    }

    // CrmLead has no `owner` relation declared (ownerId is a plain scalar FK to
    // public.User across schemas); `account` IS a declared relation. Use the
    // Unchecked update input so we can set both scalar columns directly.
    // undefined = leave field untouched, null = clear the FK, string = set it.
    const { ownerId, accountId, score: manualScore, ...rest } = data;
    const useAutoScore = await shouldUseAutoLeadScore(
      user.tenantId,
      manualScore !== undefined,
    );
    const updateData = {
      ...rest,
      dynamicFields: (mergedDyn ?? undefined) as Prisma.InputJsonValue | undefined,
      ...(ownerId === undefined ? {} : { ownerId }),
      ...(accountId === undefined ? {} : { accountId }),
      ...(!useAutoScore && manualScore !== undefined ? { score: manualScore } : {}),
    } as Prisma.CrmLeadUncheckedUpdateInput;
    let updated = await updateCrmLead(id, updateData);
    if (useAutoScore) {
      const computedScore = await syncLeadScoreAfterChange(user.tenantId, id);
      if (computedScore !== undefined) {
        updated = { ...updated, score: computedScore };
      }
    }
    await recordLeadChange({
      tenantId: user.tenantId,
      userId: user.userId,
      leadId: updated.id,
      action: "UPDATE",
      before: existing as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
    });
    onLeadUpdated(user.tenantId, updated.id).catch((err) => console.error("[automation] onLeadUpdated failed", err));
    publishLeadEvent(user.tenantId, {
      type: "updated",
      leadId: updated.id,
      stage: updated.stage,
    }).catch(() => {});
    return NextResponse.json(await maskHiddenLeadFields(user, updated));
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * Soft delete — sets `deletedAt` to now(). The shared soft-delete middleware
 * auto-filters trashed leads from default queries. To permanently remove the
 * row, use DELETE /api/leads/[id]/permanent (admin-only).
 *
 * Idempotent: re-deleting an already-trashed lead returns 200 OK without
 * re-stamping the timestamp.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "leads", "delete");
    // findUnique bypasses the soft-delete middleware (only findMany/findFirst/count
    // are intercepted) — lets us locate an already-trashed lead for idempotent re-delete.
    const existing = await prisma.crmLead.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== user.tenantId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await assertAccountAccess(user, existing.accountId);
    if (existing.deletedAt) {
      // Already in trash — idempotent success.
      return NextResponse.json({ ok: true, alreadyDeleted: true });
    }
    await prisma.crmLead.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await recordLeadChange({
      tenantId: user.tenantId,
      userId: user.userId,
      leadId: id,
      action: "DELETE",
      before: existing as unknown as Record<string, unknown>,
      after: null,
    });
    publishLeadEvent(user.tenantId, { type: "deleted", leadId: id }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
