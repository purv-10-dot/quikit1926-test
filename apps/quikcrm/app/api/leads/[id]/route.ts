import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule, maskHiddenLeadFields, filterRestrictedLeadFields } from "@/lib/auth/permissions";
import { assertAccountAccess } from "@/lib/auth/account-acl";
import { assertIcpInOrg } from "@/lib/services/icp/assert-icp";
import { updateLeadSchema } from "@/lib/validators/lead";
import { onLeadUpdated } from "@/lib/services/automation/triggers";
import { publishLeadEvent } from "@/lib/services/leads/realtime";
import { recordLeadChange, diffLead } from "@/lib/services/leads/change-log";
import {
  logBusinessEvent,
  summariseChangedFields,
  BUSINESS_EVENT_TYPES,
} from "@/lib/services/activities/business-events";
import { listLeadFields } from "@/lib/services/fields/repo";
import { validateDynamicFields } from "@/lib/services/fields/validate";
import { updateCrmLead } from "@/lib/services/leads/create-record";
import { relinkStandaloneEmailsForRecord } from "@/lib/services/email/relink";
import { assertCanAssignLeadTo } from "@/lib/services/leads/lead-assignment";
import {
  shouldUseAutoLeadScore,
  syncLeadScoreAfterChange,
} from "@/lib/services/leads/lead-scoring/integration";
import { fireLeadOwnerChangeNotifications } from "@/lib/notifications/lead-triggers";
import { evaluateRulesForEvent } from "@/lib/notifications/rules/engine";

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
    if (!lead || lead.orgId !== user.orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await assertAccountAccess(user, lead.accountId, { recordOwnerId: lead.ownerId });
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
    if (!existing || existing.orgId !== user.orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing.deletedAt) {
      return NextResponse.json(
        { error: "Lead is in trash. Restore it before editing." },
        { status: 410 },
      );
    }
    await assertAccountAccess(user, existing.accountId, { recordOwnerId: existing.ownerId });

    const body = await req.json().catch(() => null);
    const parsed = updateLeadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const data = await filterRestrictedLeadFields(user, parsed.data);
    if (data.accountId) await assertAccountAccess(user, data.accountId);
    // Org-scope the ICP reference. A null clears it, which needs no lookup.
    if (data.icpId) await assertIcpInOrg(user.orgId, data.icpId);

    // Validate owner reassignment when ownerId is explicitly included and is
    // being changed to a different, non-null user.
    if (
      data.ownerId !== undefined &&
      data.ownerId !== null &&
      data.ownerId !== existing.ownerId
    ) {
      await assertCanAssignLeadTo(user, data.ownerId);
    }

    // Merge dynamicFields: existing values + incoming patch (incoming wins). Validate against defs.
    let mergedDyn: Record<string, unknown> | undefined;
    if (data.dynamicFields !== undefined) {
      const defs = await listLeadFields(user.orgId);
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
      user.orgId,
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
      const computedScore = await syncLeadScoreAfterChange(user.orgId, id);
      if (computedScore !== undefined) {
        updated = { ...updated, score: computedScore };
      }
    }
    await recordLeadChange({
      orgId: user.orgId,
      userId: user.userId,
      leadId: updated.id,
      action: "UPDATE",
      before: existing as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
    });

    // If a primary/secondary email changed, retroactively link any standalone
    // emails already sent to the new address(es). Only fires on an actual email
    // change (idempotent + avoids needless scans on unrelated edits).
    const emailChanged =
      updated.email !== existing.email || updated.secondaryEmail !== existing.secondaryEmail;
    if (emailChanged) {
      void relinkStandaloneEmailsForRecord({
        orgId: user.orgId,
        kind: "Lead",
        recordId: updated.id,
        emails: [updated.email, updated.secondaryEmail],
      }).catch((err: unknown) => console.error("[email:relink] lead update failed", err));
    }

    // Global Activities feed: emit user-visible CrmActivity rows for the edit.
    // Stage / Status / Owner changes each get their own dedicated entry so they
    // read cleanly in the feed; all other tracked-field edits collapse into a
    // single "Lead Updated" entry. Visibility is inherited via
    // relatedKind/relatedObjectId — RBAC unchanged. (Stage/status changes made
    // through the dedicated transition route emit their own entries there; the
    // diff-gating here means the same physical change is never logged twice.)
    {
      const diff = diffLead(
        existing as unknown as Record<string, unknown>,
        updated as unknown as Record<string, unknown>,
      );
      const changed = Object.keys(diff.after).filter((f) => f !== "deletedAt");
      const base = {
        orgId: user.orgId,
        userId: user.userId,
        relatedKind: "Lead" as const,
        relatedObjectId: updated.id,
        leadId: updated.id,
        occurredAt: new Date(),
      };
      if (changed.includes("stage")) {
        await logBusinessEvent({
          ...base,
          type: "LeadStageChange",
          subject: `Stage: ${existing.stage} → ${updated.stage}`,
          outcome: "Stage updated",
        });
      }
      if (changed.includes("status")) {
        await logBusinessEvent({
          ...base,
          type: BUSINESS_EVENT_TYPES.leadStatusChange,
          subject: `Status: ${existing.status} → ${updated.status}`,
          outcome: "Status updated",
        });
      }
      if (changed.includes("ownerId") || changed.includes("ownerName")) {
        await logBusinessEvent({
          ...base,
          type: BUSINESS_EVENT_TYPES.leadOwnerChange,
          subject: `Owner changed · ${updated.name}`,
          outcome: updated.ownerName ?? "Unassigned",
        });
      }
      const handled = new Set(["stage", "status", "ownerId", "ownerName"]);
      const otherFields = changed.filter((f) => !handled.has(f));
      if (otherFields.length > 0) {
        await logBusinessEvent({
          ...base,
          type: BUSINESS_EVENT_TYPES.leadUpdated,
          subject: `Lead updated · ${updated.name}`,
          outcome: `Updated: ${summariseChangedFields(otherFields)}`,
        });
      }
    }

    onLeadUpdated(user.orgId, updated.id).catch((err) => console.error("[automation] onLeadUpdated failed", err));
    publishLeadEvent(user.orgId, {
      type: "updated",
      leadId: updated.id,
      stage: updated.stage,
    }).catch(() => {});

    // Fire owner-change notifications (assign / reassign) — non-blocking.
    // Only runs when ownerId was explicitly included in the PATCH payload.
    if (data.ownerId !== undefined) {
      fireLeadOwnerChangeNotifications({
        orgId: user.orgId,
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
      orgId: user.orgId,
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
    const existing = await prisma.crmLead.findUnique({ where: { id } });
    if (!existing || existing.orgId !== user.orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await assertAccountAccess(user, existing.accountId, { recordOwnerId: existing.ownerId });
    if (existing.deletedAt) {
      // Already in trash — idempotent success.
      return NextResponse.json({ ok: true, alreadyDeleted: true });
    }
    await prisma.crmLead.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await recordLeadChange({
      orgId: user.orgId,
      userId: user.userId,
      leadId: id,
      action: "DELETE",
      before: existing as unknown as Record<string, unknown>,
      after: null,
    });
    publishLeadEvent(user.orgId, { type: "deleted", leadId: id }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
