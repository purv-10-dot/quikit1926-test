import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { isOrgAdmin, forbidden } from "@/lib/api/permissions";
import { aggregateResponses, updateCampaignSchema } from "@/lib/schemas/habitSchema";
import { validationError } from "@/lib/api/validationError";
import { annotateRounds } from "@/lib/utils/habitRounds";

/**
 * GET /api/habits/[id]
 *
 * System admins only. Returns the campaign metadata plus the *aggregated*
 * view — never individual responses. For legacy single-user rows
 * (isLegacy=true) it returns the original per-habit scores so the History
 * panel can still render them with the old AssessmentDetail shape.
 *
 * Members hit this route → 403. Their UI uses /api/habits (which only
 * exposes the one active campaign) and PUT /my-response. The check uses
 * `isOrgAdmin` (system "admin" role only) — per-user `Habits:view` extras
 * cannot bypass this, by design: aggregate scores would leak otherwise.
 */
export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    if (!(await isOrgAdmin(userId, orgId))) return forbidden();

    const campaign = await db.habitAssessment.findFirst({
      where: { id: params.id, orgId },
    });
    if (!campaign) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    if (campaign.isLegacy) {
      // Old single-user assessment — render as-is, no aggregation path.
      return NextResponse.json({
        success: true,
        data: { campaign, legacy: true },
      });
    }

    const [responses, siblings] = await Promise.all([
      db.habitAssessmentResponse.findMany({
        where: { habitAssessmentId: params.id },
        select: { subItemBits: true },
      }),
      db.habitAssessment.findMany({
        where: { orgId, quarter: campaign.quarter, year: campaign.year, isLegacy: false },
        select: { id: true, quarter: true, year: true, createdAt: true, isLegacy: true },
      }),
    ]);
    const aggregate = aggregateResponses(responses);
    const annotated = annotateRounds(siblings);
    const meta = annotated.find((r) => r.id === campaign.id);

    // Previous-round delta: find the campaign in the same (quarter, year) with
    // round = this.round - 1, compute its aggregate %, return the difference.
    let previousPct: number | null = null;
    if (meta && meta.round > 1) {
      const prev = annotated.find(
        (r) => r.round === meta.round - 1 && r.quarter === campaign.quarter && r.year === campaign.year,
      );
      if (prev) {
        const prevResponses = await db.habitAssessmentResponse.findMany({
          where: { habitAssessmentId: prev.id },
          select: { subItemBits: true },
        });
        previousPct = aggregateResponses(prevResponses).overallPct;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        campaign,
        legacy: false,
        aggregate,
        round: meta?.round ?? 1,
        totalRounds: meta?.totalRounds ?? 1,
        previousPct,
      },
    });
  },
  { moduleKey: "habits", fallbackErrorMessage: "Failed to fetch habit campaign" },
);

/**
 * PUT /api/habits/[id]  (admin only — system admin role)
 *
 * Update deadline / notes on an existing campaign. Quarter/year are immutable
 * after creation. Legacy rows are read-only — they can be deleted but not edited.
 */
export const PUT = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, request, { params }) => {
    if (!(await isOrgAdmin(userId, orgId))) return forbidden();

    const existing = await db.habitAssessment.findFirst({
      where: { id: params.id, orgId },
      select: { id: true, isLegacy: true, status: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (existing.isLegacy) {
      return NextResponse.json(
        { success: false, error: "Legacy assessments are read-only" },
        { status: 400 },
      );
    }

    const parsed = updateCampaignSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed);
    const input = parsed.data;

    const updated = await db.habitAssessment.update({
      where: { id: params.id },
      data: {
        ...(input.deadline !== undefined && {
          deadline: input.deadline ? new Date(input.deadline) : null,
        }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  },
  { moduleKey: "habits", fallbackErrorMessage: "Failed to update habit campaign" },
);

/**
 * DELETE /api/habits/[id]  (admin only — system admin role)
 *
 * Cascades to HabitAssessmentResponse via the FK ON DELETE CASCADE.
 */
export const DELETE = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    if (!(await isOrgAdmin(userId, orgId))) return forbidden();

    const existing = await db.habitAssessment.findFirst({
      where: { id: params.id, orgId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    await db.habitAssessment.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  },
  { moduleKey: "habits", fallbackErrorMessage: "Failed to delete habit campaign" },
);
