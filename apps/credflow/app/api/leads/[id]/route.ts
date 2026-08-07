import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule, maskHiddenLeadFields, filterRestrictedLeadFields } from "@/lib/auth/permissions";
import { assertAccountAccess } from "@/lib/auth/account-acl";
import { assertLeadOwnership } from "@/lib/auth/owner-scope";
import { updateLeadSchema } from "@/lib/validators/lead";
import {
  getPipelineConfig,
  validateLeadPipelineCascade,
} from "@/lib/services/workspace/pipeline-config";
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
import { fireLeadOwnerChangeNotifications } from "@/lib/notifications/lead-triggers";
import { evaluateRulesForEvent } from "@/lib/notifications/rules/engine";
import { normalizePhoneOrError } from "@/lib/services/shared/phone-normalize";
import { getWorkspacePhoneDefaultCountry } from "@/lib/services/workspace/phone-config";

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
    const lead = await prisma.qcfLead.findUnique({ where: { id } });
    if (!lead || lead.tenantId !== user.tenantId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await assertAccountAccess(user, lead.accountId);
    await assertLeadOwnership(user, lead.ownerId);
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
    const existing = await prisma.qcfLead.findUnique({ where: { id } });
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
    await assertLeadOwnership(user, existing.ownerId);

    const body = await req.json().catch(() => null);
    const parsed = updateLeadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const data = await filterRestrictedLeadFields(user, parsed.data);
    if (data.accountId) await assertAccountAccess(user, data.accountId);

    // Normalize phone/mobile to E.164 before write (only for fields present in
    // the patch). Reject genuinely-invalid numbers with the lead route's
    // { error, errors } shape. undefined = not being updated → skip.
    if (data.phone !== undefined || data.mobile !== undefined) {
      const defaultCountry = await getWorkspacePhoneDefaultCountry(user.tenantId);
      if (data.phone !== undefined) {
        const r = normalizePhoneOrError(data.phone, defaultCountry);
        if (!r.ok) {
          return NextResponse.json(
            { error: "Validation failed", errors: { phone: [r.message] } },
            { status: 400 },
          );
        }
        data.phone = r.value;
      }
      if (data.mobile !== undefined) {
        const r = normalizePhoneOrError(data.mobile, defaultCountry);
        if (!r.ok) {
          return NextResponse.json(
            { error: "Validation failed", errors: { mobile: [r.message] } },
            { status: 400 },
          );
        }
        data.mobile = r.value;
      }
    }

    // Pipeline cascade guards (source → stage → status → sub-status). The PATCH
    // path previously let stage/status/substatus flow straight through with no
    // validation; enforce the same cascade as create/transition. Validate the
    // EFFECTIVE record (existing merged with the patch) but only enforce a rule
    // when the field it constrains is actually being written.
    if (
      data.source !== undefined ||
      data.stage !== undefined ||
      data.status !== undefined ||
      data.substatus !== undefined
    ) {
      const pipeline = await getPipelineConfig(user.tenantId);
      const cascadeError = validateLeadPipelineCascade({
        pipeline,
        source: data.source !== undefined ? data.source : existing.source,
        stage: data.stage !== undefined ? data.stage : existing.stage,
        status: data.status !== undefined ? data.status : existing.status,
        substatus: data.substatus !== undefined ? data.substatus : existing.substatus,
        writing: {
          source: data.source !== undefined,
          stage: data.stage !== undefined,
          status: data.status !== undefined,
          substatus: data.substatus !== undefined,
        },
      });
      if (cascadeError) {
        return NextResponse.json(
          { error: cascadeError.message, errors: cascadeError.errors },
          { status: 400 },
        );
      }
    }

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

    // QcfLead has no `owner` relation declared (ownerId is a plain scalar FK to
    // public.User across schemas); `account` IS a declared relation. Use the
    // Unchecked update input so we can set both scalar columns directly.
    // undefined = leave field untouched, null = clear the FK, string = set it.
    // Strip fields present in the Zod schema but absent from QcfLead.
    const {
      ownerId,
      accountId,
      score:              manualScore,
      originChannel:      _originChannel,
      firstName:          _firstName,
      lastName:           _lastName,
      leadType:           _leadType,
      contactLinkedinUrl: _contactLinkedinUrl,
      technology:         _technology,
      requirementDetails: _requirementDetails,
      topic:              _topic,
      sourceDetails:      _sourceDetails,
      ...rest
    } = data;
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
    } as Prisma.QcfLeadUncheckedUpdateInput;
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
    // NOTE: outbound LeadSquared enqueue now fires inside updateCrmLead (right
    // after the row is committed), so it is intentionally NOT called here.

    // Fire owner-change notifications (assign / reassign) — non-blocking.
    // Only runs when ownerId was explicitly included in the PATCH payload.
    if (data.ownerId !== undefined) {
      fireLeadOwnerChangeNotifications({
        tenantId: user.tenantId,
        actorUserId: user.userId,
        actorName: user.name || user.email,
        leadId: updated.id,
        leadName: updated.name,
        oldOwnerId: existing.ownerId,
        newOwnerId: updated.ownerId,
        newOwnerName: updated.ownerName,
      }).catch((err) =>
        console.error("[notifications] fireLeadOwnerChangeNotifications failed", err),
      );
    }

    // ── Rules engine (runs AFTER existing notifications, never replaces them) ──
    const changedFields = Object.keys(data);
    evaluateRulesForEvent({
      event: "updated",
      entityType: "lead",
      entityId: updated.id,
      tenantId: user.tenantId,
      actorUserId: user.userId,
      actorName: user.name || user.email,
      before: existing as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
      changedFields,
    }).catch((err) => console.error("[rules-engine] lead update failed", err));

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
    const existing = await prisma.qcfLead.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== user.tenantId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await assertAccountAccess(user, existing.accountId);
    await assertLeadOwnership(user, existing.ownerId);
    if (existing.deletedAt) {
      // Already in trash — idempotent success.
      return NextResponse.json({ ok: true, alreadyDeleted: true });
    }
    await prisma.qcfLead.update({
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
