import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { isOrgAdmin, forbidden } from "@/lib/api/permissions";
import { launchCampaignSchema } from "@/lib/schemas/habitSchema";
import { validationError } from "@/lib/api/validationError";
import { notifyHabitCampaign } from "@/lib/services/habitNotifications";
import { annotateRounds } from "@/lib/utils/habitRounds";
import { getCanAddPastQuarterHabit } from "@/lib/utils/featureFlags";
import { getQuarterPeriodStatus } from "@/lib/utils/habitQuarterPeriod";

const ADMIN_FIELDS = {
  id: true,
  quarter: true,
  year: true,
  status: true,
  deadline: true,
  publishedAt: true,
  closedAt: true,
  isLegacy: true,
  maturityLevel: true,
  averageScore: true,
  notes: true,
  assessmentDate: true,
  assessedBy: true,
  createdAt: true,
  updatedAt: true,
  habit1_vision: true,
  habit2_meetings: true,
  habit3_scoreboards: true,
  habit4_accountable: true,
  habit5_rhythm: true,
  habit6_sticking: true,
  habit7_cascading: true,
  habit8_recognition: true,
  habit9_training: true,
  habit10_innovation: true,
} as const;

const MEMBER_FIELDS = {
  id: true,
  quarter: true,
  year: true,
  status: true,
  deadline: true,
  publishedAt: true,
} as const;

/**
 * GET /api/habits
 *
 * Admin (Habits:view): returns the full History — every campaign for the org,
 * including drafts and legacy single-user rows. Supports ?year/?quarter filters.
 *
 * Member (no Habits:view): returns *at most one* active campaign and a
 * `hasSubmitted` flag so the member UI can render either the empty-state or
 * the fill form. No scores, no draft visibility, no list.
 */
export const GET = withOrgAuth(
  async ({ orgId, userId }, request) => {
    const isAdmin = await isOrgAdmin(userId, orgId);

    if (isAdmin) {
      const { searchParams } = request.nextUrl;
      const year = searchParams.get("year") ? Number(searchParams.get("year")) : undefined;
      const quarter = searchParams.get("quarter") ?? undefined;

      const where: Record<string, unknown> = { orgId };
      if (year) where.year = year;
      if (quarter) where.quarter = quarter;

      const assessments = await db.habitAssessment.findMany({
        where,
        orderBy: [{ year: "desc" }, { quarter: "desc" }],
        select: { ...ADMIN_FIELDS, createdAt: true },
      });

      const annotated = annotateRounds(assessments);
      return NextResponse.json({ success: true, data: annotated, role: "admin" });
    }

    // Member view — every active campaign the member should fill. Multiple
    // are possible (e.g. Q1 2026 Round 2 + Q2 2026 in parallel), so we return
    // an array; the UI either auto-opens the only one or shows a picker.
    const actives = await db.habitAssessment.findMany({
      where: { orgId, status: "active", isLegacy: false },
      orderBy: [{ publishedAt: "desc" }],
      select: { ...MEMBER_FIELDS, createdAt: true, isLegacy: true },
    });

    if (actives.length === 0) {
      return NextResponse.json({ success: true, data: [], role: "member" });
    }

    // Pull each active campaign's siblings (other rounds of same quarter) so
    // we can annotate `round / totalRounds`, plus the member's own response
    // for each in one round-trip.
    const myResponses = await db.habitAssessmentResponse.findMany({
      where: {
        habitAssessmentId: { in: actives.map((a) => a.id) },
        respondentUserId: userId,
      },
      select: { habitAssessmentId: true, submittedAt: true },
    });
    const responseMap = new Map(myResponses.map((r) => [r.habitAssessmentId, r.submittedAt]));

    const siblings = await db.habitAssessment.findMany({
      where: {
        orgId,
        isLegacy: false,
        OR: actives.map((a) => ({ quarter: a.quarter, year: a.year })),
      },
      select: { id: true, quarter: true, year: true, createdAt: true, isLegacy: true },
    });
    const annotated = annotateRounds(siblings);
    const roundMap = new Map(annotated.map((r) => [r.id, { round: r.round, total: r.totalRounds }]));

    const data = actives.map((active) => {
      const submittedAt = responseMap.get(active.id) ?? null;
      const meta = roundMap.get(active.id);
      return {
        ...active,
        hasSubmitted: !!submittedAt,
        submittedAt: submittedAt ? submittedAt.toISOString() : null,
        round: meta?.round ?? 1,
        totalRounds: meta?.total ?? 1,
      };
    });

    return NextResponse.json({ success: true, role: "member", data });
  },
  { moduleKey: "habits", fallbackErrorMessage: "Failed to fetch habit assessments" },
);

/**
 * POST /api/habits  (admin only — system admin role)
 *
 * Creates a new draft campaign for (quarter, year). Multiple campaigns per
 * quarter are allowed (a quarter can have several "rounds" / pulse-checks),
 * but only one can be open (draft or active) at a time — the admin must
 * close the current one before opening the next. Closed rounds stay in
 * History as their own row.
 */
export const POST = withOrgAuth(
  async ({ orgId, userId }, request) => {
    if (!(await isOrgAdmin(userId, orgId))) return forbidden();
    const parsed = launchCampaignSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed);
    const input = parsed.data;

    // Past-quarter gate. If the (year, quarter) maps to a configured
    // QuarterSetting whose period has already ended, reject unless the
    // `add_past_quarter_habit` flag is on. Unconfigured quarters can't be
    // classified, so they fall through (preserves prior behavior).
    const qs = await db.quarterSetting.findFirst({
      where: { orgId, fiscalYear: input.year, quarter: input.quarter },
      select: { startDate: true, endDate: true },
    });
    if (qs && getQuarterPeriodStatus(qs.startDate, qs.endDate) === "past") {
      if (!(await getCanAddPastQuarterHabit(orgId))) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Past-quarter assessments are disabled. Enable 'Add Past Quarter Habit' in Settings → Configurations.",
          },
          { status: 403 },
        );
      }
    }

    const open = await db.habitAssessment.findFirst({
      where: {
        orgId,
        quarter: input.quarter,
        year: input.year,
        isLegacy: false,
        status: { in: ["draft", "active"] },
      },
      select: { id: true, status: true },
    });
    if (open) {
      return NextResponse.json(
        {
          success: false,
          error: `There is already an ${open.status} campaign for ${input.quarter} ${input.year}. Close it before starting a new round.`,
        },
        { status: 409 },
      );
    }

    const created = await db.habitAssessment.create({
      data: {
        orgId,
        quarter: input.quarter,
        year: input.year,
        assessmentDate: new Date(),
        assessedBy: userId,
        status: "draft",
        deadline: input.deadline ? new Date(input.deadline) : null,
        notes: input.notes ?? null,
        isLegacy: false,
        teamId: input.teamId ?? null,
        // Required by the schema, so always non-empty here. Older campaigns may
        // still hold an empty list, which the read paths treat as org-wide.
        participantUserIds: input.participantUserIds,
      },
      select: ADMIN_FIELDS,
    });

    // Awaited so a serverless freeze after the response can't drop the sends
    // (the WWW fire-and-forget bug). Swallowed so mail failure never fails
    // creation.
    await notifyHabitCampaign({
      orgId,
      campaignId: created.id,
      event: "created",
      actorUserId: userId,
      quarter: created.quarter,
      year: created.year,
      deadline: created.deadline,
      participantUserIds: input.participantUserIds,
    }).catch((err) => {
      console.error("[POST /api/habits] notifyHabitCampaign failed:", err);
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  },
  {
    moduleKey: "habits",
    fallbackErrorMessage: "Failed to create habit campaign",
  },
);
