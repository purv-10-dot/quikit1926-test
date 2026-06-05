import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { isOrgAdmin, forbidden } from "@/lib/api/permissions";
import { aggregateResponses } from "@/lib/schemas/habitSchema";
import { annotateRounds } from "@/lib/utils/habitRounds";
import { buildHabitsChecklistWorkbook } from "@/lib/exports/habitsChecklistExcel";

/**
 * GET /api/habits/[id]/export
 *
 * System admins only (same guard as GET /api/habits/[id]). Streams the
 * Rockefeller Habits Checklist as a colour-coded .xlsx — the % cells use the
 * same green → lime → amber → red ramp as the dashboard table.
 *
 * Legacy single-user assessments are not exportable (no sub-item bits to
 * aggregate) → 400.
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
      return NextResponse.json(
        { success: false, error: "Legacy assessments cannot be exported" },
        { status: 400 },
      );
    }

    const [responses, siblings, members, participationResponses] = await Promise.all([
      db.habitAssessmentResponse.findMany({
        where: { habitAssessmentId: params.id },
        select: { subItemBits: true },
      }),
      db.habitAssessment.findMany({
        where: { orgId, quarter: campaign.quarter, year: campaign.year, isLegacy: false },
        select: { id: true, quarter: true, year: true, createdAt: true, isLegacy: true },
      }),
      // Participation roster — same query as GET /api/habits/[id]/participation.
      db.orgMember.findMany({
        where: { orgId, status: "active" },
        select: {
          role: true,
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      db.habitAssessmentResponse.findMany({
        where: { habitAssessmentId: params.id },
        select: { respondentUserId: true, submittedAt: true },
      }),
    ]);
    const aggregate = aggregateResponses(responses);

    // Build the participation breakdown (who submitted vs. pending).
    const submittedMap = new Map(
      participationResponses.map((r) => [r.respondentUserId, r.submittedAt]),
    );
    const participationRows = members
      .filter((m): m is typeof m & { user: NonNullable<typeof m.user> } => !!m.user)
      .map((m) => {
        const u = m.user;
        const submittedAt = submittedMap.get(u.id) ?? null;
        return {
          name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
          email: u.email,
          role: m.role,
          hasSubmitted: !!submittedAt,
          submittedAt: submittedAt ? submittedAt.toISOString() : null,
        };
      });
    const submittedCount = participationRows.filter((r) => r.hasSubmitted).length;
    const participation = {
      total: participationRows.length,
      submitted: submittedCount,
      pending: participationRows.length - submittedCount,
      members: participationRows,
    };

    const meta = annotateRounds(siblings).find((r) => r.id === campaign.id);
    const totalRounds = meta?.totalRounds ?? 1;
    const round = meta?.round ?? 1;
    const campaignLabel =
      totalRounds > 1
        ? `${campaign.quarter} ${campaign.year} · Round ${round}`
        : `${campaign.quarter} ${campaign.year}`;

    const buf = await buildHabitsChecklistWorkbook(aggregate, campaignLabel, participation);
    const filename = `Rockefeller_Habits_${campaignLabel.replace(/[^\w]+/g, "_").replace(/^_|_$/g, "")}.xlsx`;
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  },
  { moduleKey: "habits", fallbackErrorMessage: "Failed to export habit checklist" },
);
