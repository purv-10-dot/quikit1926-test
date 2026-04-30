/**
 * POST /api/deals/[id]/advance — advance a deal to the next stage.
 *
 * Body: { toStage?: string, justification?: string }
 *   - When toStage is omitted, advances to the next canonical stage.
 *   - justification stored on the timeline event + audit log.
 *
 * Side effects (one transaction):
 *   1. Update VCDeal.currentStage
 *   2. Append VCTimelineEvent(type=stage-advanced)
 *   3. Reset daysInStage = 0
 *   4. Email founder via Resend (best-effort, non-blocking)
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withTenantAuth } from "@/lib/api/withTenantAuth";
import {
  STAGE_ORDER,
  STAGE_LABEL,
  FOUNDER_STAGE_LABEL,
  type StageId,
} from "@/lib/pipeline";
import { sendEmail } from "@/lib/email";
import StageChangedEmail from "@/lib/email/templates/stage-changed";
import { ANALYST_ROLES, PARTNER_ROLES, requireRoleOrAudit } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const STAGE_ENUM = STAGE_ORDER as unknown as readonly [StageId, ...StageId[]];

const bodySchema = z.object({
  toStage: z.enum(STAGE_ENUM).optional(),
  justification: z.string().max(2000).optional(),
});

export const POST = withTenantAuth(
  async ({ tenantId, userId }, req: NextRequest, { params }: { params: { id: string } }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }

    const deal = await db.vCDeal.findFirst({
      where: { id: params.id, tenantId },
      include: {
        application: {
          select: { startupName: true, contactName: true, contactEmail: true },
        },
      },
    });
    if (!deal) {
      return NextResponse.json({ success: false, error: "Deal not found" }, { status: 404 });
    }
    if (deal.closedStatus !== "open") {
      return NextResponse.json(
        { success: false, error: "Deal is closed and cannot advance" },
        { status: 409 },
      );
    }

    const fromStage = deal.currentStage as StageId;
    const currentIdx = STAGE_ORDER.indexOf(fromStage);
    const toStage =
      parsed.data.toStage ??
      (currentIdx < STAGE_ORDER.length - 1 ? STAGE_ORDER[currentIdx + 1] : null);

    if (!toStage) {
      return NextResponse.json(
        { success: false, error: "Already at the final stage" },
        { status: 409 },
      );
    }
    if (STAGE_ORDER.indexOf(toStage) <= currentIdx) {
      return NextResponse.json(
        { success: false, error: "Stage advancement must move forward" },
        { status: 400 },
      );
    }

    // Gating: partner-only transitions vs analyst+ transitions
    const PARTNER_GATED_STAGES: StageId[] = ["ic-review", "due-diligence", "final-decision"];
    const requiredRoles = PARTNER_GATED_STAGES.includes(toStage)
      ? PARTNER_ROLES
      : ANALYST_ROLES;
    const denied = await requireRoleOrAudit(userId, tenantId, requiredRoles, {
      action: "deal.advance",
      resource: deal.id,
      req,
    });
    if (denied) return denied;

    // Persist + audit
    await db.$transaction([
      db.vCDeal.update({
        where: { id: deal.id },
        data: {
          currentStage: toStage,
          daysInStage: 0,
          // Mark deal as closed-won when reaching final stage; analyst can override later.
          ...(toStage === "final-decision" ? { closedStatus: "closed-won" } : {}),
          updatedBy: userId,
        },
      }),
      db.vCTimelineEvent.create({
        data: {
          tenantId,
          dealId: deal.id,
          type: "stage-advanced",
          actorId: userId,
          summary: `Advanced from ${STAGE_LABEL[fromStage]} → ${STAGE_LABEL[toStage]}`,
          payload: {
            fromStage,
            toStage,
            justification: parsed.data.justification ?? null,
          },
          visibility: "founder",
        },
      }),
    ]);

    await audit({
      tenantId,
      userId,
      action: "deal.advance",
      resource: deal.id,
      metadata: { fromStage, toStage, justification: parsed.data.justification ?? null },
      req,
    });

    // Best-effort email — failures don't block the advance.
    try {
      await sendEmail({
        to: deal.application.contactEmail,
        subject: `${deal.application.startupName} — moved to ${STAGE_LABEL[toStage]}`,
        template: StageChangedEmail({
          founderName: deal.application.contactName,
          startupName: deal.application.startupName,
          newStageLabel: FOUNDER_STAGE_LABEL[toStage],
          appUrl:
            process.env.NEXTAUTH_URL ??
            (process.env.NODE_ENV === "production"
              ? (() => { throw new Error("NEXTAUTH_URL env var not set"); })()
              : "http://localhost:3008"), // prod-safety-allow: dev-only fallback, prod throws
        }),
      });
    } catch (emailErr: unknown) {
      const m = emailErr instanceof Error ? emailErr.message : "email failed";
      // eslint-disable-next-line no-console
      console.error("[deals/advance] email send failed:", m);
    }

    return NextResponse.json({
      success: true,
      data: { fromStage, toStage },
    });
  },
);
