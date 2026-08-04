/**
 * Org-specific demo/sample data — seeded once so a freshly-onboarded org
 * doesn't land on empty screens, and clearable in one admin action once real
 * data is ready to take over.
 *
 * Every row this module creates is tagged `isDemoData: true` and owned by
 * the admin who triggered seeding (no throwaway login accounts are created —
 * `User` rows are shared platform-wide, not org-scoped content). Seeding and
 * clearing are both idempotent and gated by `DemoDataState`:
 *   - `seededAt` set  → seeding is a no-op on every subsequent call.
 *   - `clearedAt` set → seeding never fires again for this org, even if a
 *     new admin logs in later. Demo data is a first-run affordance, not a
 *     recurring one.
 */
import { ClientMeetingFlag, ClientMeetingStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getFiscalQuarter, getFiscalYear, getCurrentFiscalWeekFromStart } from "@/lib/utils/fiscal";
import { generateQuarterDates } from "@/lib/utils/quarterGen";

export interface SeedDemoDataResult {
  seeded: boolean;
  reason?: "already-seeded" | "cleared" | "created";
}

export interface ClearDemoDataResult {
  cleared: boolean;
  reason?: "nothing-to-clear";
}

/**
 * Every module gated on "quarters configured" (KPI, Priority, WWW, Meeting
 * Rhythm, ...) refuses to render ANY data — real or demo — until at least
 * one QuarterSetting row exists for the org. A brand-new org has none yet,
 * so demo content is invisible unless we seed a fiscal calendar too.
 *
 * Uses the exact same generator as the "Initialize Quarters" flow
 * (app/api/org/quarters/route.ts) so the seeded quarters look identical to
 * what an admin would have created by hand. If quarters already exist
 * (org went through onboarding for real, or was seeded before), they're
 * left untouched and reused as-is.
 */
async function ensureQuarterContext(
  tx: Pick<typeof db, "quarterSetting" | "org">,
  orgId: string,
  adminUserId: string,
) {
  const existing = await tx.quarterSetting.findMany({
    where: { orgId },
    orderBy: [{ fiscalYear: "desc" }, { quarter: "asc" }],
  });

  let rows = existing;
  if (rows.length === 0) {
    const org = await tx.org.findUnique({ where: { id: orgId }, select: { fiscalYearStart: true } });
    const fiscalStartMonth = org?.fiscalYearStart ?? 4;
    const fiscalYear = getFiscalYear();
    const quarterDates = generateQuarterDates(fiscalYear, fiscalStartMonth);

    rows = await Promise.all(
      quarterDates.map((q) =>
        tx.quarterSetting.create({
          data: {
            orgId,
            fiscalYear,
            quarter: q.quarter,
            startDate: q.startDate,
            endDate: q.endDate,
            weekCount: q.weekCount ?? 13,
            createdBy: adminUserId,
            isDemoData: true,
          },
        }),
      ),
    );
  }

  const today = new Date();
  const current = rows.find((r) => today >= r.startDate && today <= r.endDate);
  const row = current ?? rows[0] ?? null;

  if (!row) {
    return { year: getFiscalYear(), quarter: getFiscalQuarter(), currentWeek: 3, weekCount: 13 };
  }

  const currentWeek = getCurrentFiscalWeekFromStart(row.startDate, row.weekCount, null, row.endDate);
  return { year: row.fiscalYear, quarter: row.quarter, currentWeek, weekCount: row.weekCount };
}

/** Random int in [min, max], inclusive. Seed data doesn't need crypto-grade randomness. */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function seedDemoDataForOrg(orgId: string, adminUserId: string): Promise<SeedDemoDataResult> {
  const state = await db.demoDataState.findUnique({ where: { orgId } });
  if (state?.clearedAt) return { seeded: false, reason: "cleared" };
  if (state?.seededAt) return { seeded: false, reason: "already-seeded" };

  const now = new Date();

  await db.$transaction(async (tx) => {
    // --- Org Setup: Quarter Settings (prerequisite for every other module) --
    const { year, quarter, currentWeek } = await ensureQuarterContext(tx, orgId, adminUserId);

    // --- Org Setup: Teams + Unit Master ---------------------------------
    const salesTeam = await tx.qsTeam.create({
      data: { orgId, name: "Demo Sales", slug: `demo-sales-${orgId.slice(0, 6)}`, color: "#10b981", createdBy: adminUserId, isDemoData: true },
    });
    const engineeringTeam = await tx.qsTeam.create({
      data: { orgId, name: "Demo Engineering", slug: `demo-engineering-${orgId.slice(0, 6)}`, color: "#3b82f6", createdBy: adminUserId, isDemoData: true },
    });

    await tx.unitMaster.createMany({
      data: [
        { orgId, name: "Leads", nameKey: "leads", createdBy: adminUserId, isDemoData: true },
        { orgId, name: "Calls", nameKey: "calls", createdBy: adminUserId, isDemoData: true },
        { orgId, name: "Hours", nameKey: "hours", createdBy: adminUserId, isDemoData: true },
      ],
    });

    // --- OPSP: Category Master (used by OPSP Targets/Goals category pickers) --
    await tx.categoryMaster.createMany({
      data: [
        { orgId, name: "Demo Revenue", nameKey: "demo revenue", dataType: "Currency", currency: "INR", createdBy: adminUserId, isDemoData: true },
        { orgId, name: "Demo Operations", nameKey: "demo operations", dataType: "Number", createdBy: adminUserId, isDemoData: true },
        { orgId, name: "Demo Customer", nameKey: "demo customer", dataType: "Percentage", createdBy: adminUserId, isDemoData: true },
      ],
    });

    // --- KPI (Individual + Team) -----------------------------------------
    const kpiDefs = [
      { name: "Monthly Revenue", kpiLevel: "individual", teamId: null, measurementUnit: "Currency", target: 1_500_000, healthStatus: "on-track" },
      { name: "Customer NPS", kpiLevel: "individual", teamId: null, measurementUnit: "Percentage", target: 80, healthStatus: "at-risk" },
      { name: "Tickets Resolved", kpiLevel: "individual", teamId: null, measurementUnit: "Number", target: 50, healthStatus: "on-track" },
      { name: "Bug Fixes Shipped", kpiLevel: "individual", teamId: null, measurementUnit: "Number", target: 25, healthStatus: "off-track" },
      { name: "Quarterly Revenue", kpiLevel: "team", teamId: salesTeam.id, measurementUnit: "Currency", target: 12_000_000, healthStatus: "on-track" },
      { name: "Team Velocity (Story Points)", kpiLevel: "team", teamId: engineeringTeam.id, measurementUnit: "Number", target: 600, healthStatus: "at-risk" },
    ];

    for (const def of kpiDefs) {
      const kpi = await tx.kPI.create({
        data: {
          orgId,
          name: def.name,
          kpiLevel: def.kpiLevel,
          owner: adminUserId,
          teamId: def.teamId,
          quarter,
          year,
          measurementUnit: def.measurementUnit,
          target: def.target,
          quarterlyGoal: def.target,
          healthStatus: def.healthStatus,
          status: "active",
          createdBy: adminUserId,
          isDemoData: true,
        },
      });

      const weeksToFill = Math.min(currentWeek, 4);
      for (let w = Math.max(1, currentWeek - weeksToFill + 1); w <= currentWeek; w++) {
        await tx.kPIWeeklyValue.create({
          data: {
            orgId,
            kpiId: kpi.id,
            userId: adminUserId,
            weekNumber: w,
            value: Math.round(def.target * (w / (currentWeek + 2)) * 100) / 100,
            createdBy: adminUserId,
          },
        });
      }
    }

    // --- Priority ----------------------------------------------------------
    const priorityDefs = [
      { name: "Launch v2 of customer portal", overallStatus: "on-track" },
      { name: "Migrate legacy CRM to new stack", overallStatus: "behind-schedule" },
      { name: "Hire 2 senior engineers", overallStatus: "completed" },
      { name: "Close 5 enterprise deals", overallStatus: "not-yet-started" },
    ];
    for (const def of priorityDefs) {
      await tx.priority.create({
        data: {
          orgId,
          name: def.name,
          owner: adminUserId,
          quarter,
          year,
          overallStatus: def.overallStatus,
          createdBy: adminUserId,
          isDemoData: true,
        },
      });
    }

    // --- WWW -----------------------------------------------------------------
    const wwwDefs = [
      { what: "Closed first enterprise deal", status: "completed", offsetDays: -5 },
      { what: "Shipped dark mode support", status: "on-track", offsetDays: 3 },
      { what: "Reduced bug backlog by 40%", status: "at-risk", offsetDays: 7 },
      { what: "Onboarded new team member", status: "not-started", offsetDays: 14 },
    ];
    for (const def of wwwDefs) {
      const when = new Date(now);
      when.setDate(when.getDate() + def.offsetDays);
      await tx.wWWItem.create({
        data: {
          orgId,
          who: adminUserId,
          whoIds: [adminUserId],
          what: def.what,
          when,
          status: def.status,
          createdBy: adminUserId,
          isDemoData: true,
        },
      });
    }

    // --- Client Master / Members / Daily Huddle / Weekly Meeting -----------
    const client = await tx.client.create({
      data: {
        orgId,
        name: "Demo Client Co.",
        isActive: true,
        weeklyStartTime: "10:00",
        weeklyEndTime: "11:00",
        dailyStartTime: "09:00",
        dailyEndTime: "09:15",
        createdBy: adminUserId,
        isDemoData: true,
      },
    });

    const member1 = await tx.clientMember.create({
      data: { orgId, name: "Priya Nair", email: "priya.nair@democlient.example", createdBy: adminUserId, isDemoData: true },
    });
    const member2 = await tx.clientMember.create({
      data: { orgId, name: "Rahul Verma", email: "rahul.verma@democlient.example", createdBy: adminUserId, isDemoData: true },
    });
    await tx.clientTeamMember.createMany({
      data: [
        { clientId: client.id, clientMemberId: member1.id, orgId },
        { clientId: client.id, clientMemberId: member2.id, orgId },
      ],
    });

    for (let i = 0; i < 3; i++) {
      const meetingDate = new Date(now);
      meetingDate.setDate(meetingDate.getDate() - i * 1);
      await tx.clientDailyHuddle.create({
        data: {
          orgId,
          clientId: client.id,
          meetingDate,
          callStatus: i === 1 ? ClientMeetingStatus.NOT_HELD : ClientMeetingStatus.HELD,
          format1Status: ClientMeetingFlag.YES,
          format2Status: ClientMeetingFlag.YES,
          stuckCallStatus: ClientMeetingFlag.NO,
          totalMembers: 2,
          createdBy: adminUserId,
          isDemoData: true,
        },
      });
    }

    for (let i = 0; i < 2; i++) {
      const meetingDate = new Date(now);
      meetingDate.setDate(meetingDate.getDate() - i * 7);
      await tx.clientWeeklyMeeting.create({
        data: {
          orgId,
          clientId: client.id,
          meetingDate,
          callStatus: ClientMeetingStatus.HELD,
          goodNewsSharing: ClientMeetingFlag.YES,
          kpDashboard: ClientMeetingFlag.YES,
          www: ClientMeetingFlag.YES,
          opspReview: i === 0 ? ClientMeetingFlag.YES : ClientMeetingFlag.NA,
          createdBy: adminUserId,
          isDemoData: true,
        },
      });
    }

    // --- OPSP ------------------------------------------------------------------
    await tx.oPSPData.create({
      data: {
        orgId,
        userId: adminUserId,
        year,
        quarter,
        status: "draft",
        coreValues: "Customer obsession, ownership, integrity",
        purpose: "Help growing businesses run a disciplined weekly performance rhythm.",
        bhag: "₹100 Cr ARR by 2030",
        rocks: [{ text: "Ship v2 of the customer portal", owner: "Demo Admin" }],
        createdBy: adminUserId,
        isDemoData: true,
      },
    });
    await tx.oPSPUserSection.create({
      data: {
        orgId,
        userId: adminUserId,
        year,
        quarter,
        quarterlyPriorities: [{ text: "Close 5 enterprise deals" }],
        createdBy: adminUserId,
        isDemoData: true,
      },
    });
    await tx.oPSPPlan.create({
      data: {
        orgId,
        userId: adminUserId,
        achievements_1yr: "Grow team from 20 to 35",
        rituals_90d: "Weekly 1:1s with every direct report",
        isDemoData: true,
      },
    });

    // --- Habits ------------------------------------------------------------------
    const habit = await tx.habitAssessment.create({
      data: {
        orgId,
        assessmentDate: now,
        quarter,
        year,
        status: "active",
        assessedBy: adminUserId,
        habit1_vision: 4,
        habit2_meetings: 3,
        habit3_scoreboards: 4,
        averageScore: 3.7,
        maturityLevel: "Developing",
        isDemoData: true,
      },
    });
    await tx.habitAssessmentResponse.create({
      data: { habitAssessmentId: habit.id, respondentUserId: adminUserId, subItemBits: {} },
    });

    // --- SWT ------------------------------------------------------------------------
    await tx.sWTEntry.createMany({
      data: [
        { orgId, quarter, year, type: "strength", content: "Strong founder-led sales motion", createdBy: adminUserId, isDemoData: true },
        { orgId, quarter, year, type: "weakness", content: "No dedicated QA function yet", createdBy: adminUserId, isDemoData: true },
        { orgId, quarter, year, type: "trend", content: "Customers increasingly asking for SSO", trendDirection: "up", createdBy: adminUserId, isDemoData: true },
      ],
    });

    // --- Goals & Pillars -----------------------------------------------------------
    const parentGoal = await tx.goal.create({
      data: {
        orgId,
        ownerId: adminUserId,
        title: "Scale revenue engine",
        category: "Strategy",
        year,
        quarter,
        status: "on-track",
        targetValue: 100,
        currentValue: 40,
        progressPercent: 40,
        createdBy: adminUserId,
        isDemoData: true,
      },
    });
    await tx.goal.create({
      data: {
        orgId,
        ownerId: adminUserId,
        parentGoalId: parentGoal.id,
        title: "Hire 2 enterprise AEs",
        category: "People",
        year,
        quarter,
        status: "at-risk",
        targetValue: 2,
        currentValue: 1,
        progressPercent: 50,
        createdBy: adminUserId,
        isDemoData: true,
      },
    });

    // --- FACe / PACe -----------------------------------------------------------------
    const faceParent = await tx.accountabilityFunction.create({
      data: { orgId, name: "Leadership", chartType: "face", assignedToUserId: adminUserId, isDemoData: true },
    });
    await tx.accountabilityFunction.create({
      data: { orgId, name: "Sales", chartType: "face", parentFunctionId: faceParent.id, teamId: salesTeam.id, assignedToUserId: adminUserId, isDemoData: true },
    });
    const paceParent = await tx.accountabilityFunction.create({
      data: {
        orgId,
        name: "Close 5 enterprise deals",
        chartType: "pace",
        assignedToUserId: adminUserId,
        expectedOutcomes: "₹4Cr in new ARR this quarter",
        isDemoData: true,
      },
    });
    await tx.accountabilityFunction.create({
      data: {
        orgId,
        name: "Ship v2 customer portal",
        chartType: "pace",
        parentFunctionId: paceParent.id,
        teamId: engineeringTeam.id,
        assignedToUserId: adminUserId,
        leadingIndicators: `${randInt(60, 90)}% of sprint velocity`,
        isDemoData: true,
      },
    });

    // --- Tracking ----------------------------------------------------------------------
    await tx.demoDataState.upsert({
      where: { orgId },
      create: { orgId, seededAt: now },
      update: { seededAt: now },
    });
  });

  return { seeded: true, reason: "created" };
}

/**
 * Deletes every `isDemoData: true` row for the org, children before parents
 * so FK constraints hold. Sets `DemoDataState.clearedAt` so seeding never
 * re-fires for this org.
 */
export async function clearDemoDataForOrg(orgId: string): Promise<ClearDemoDataResult> {
  const state = await db.demoDataState.findUnique({ where: { orgId } });
  if (!state?.seededAt) return { cleared: false, reason: "nothing-to-clear" };

  await db.$transaction(async (tx) => {
    const demoKpis = await tx.kPI.findMany({ where: { orgId, isDemoData: true }, select: { id: true } });
    const kpiIds = demoKpis.map((k) => k.id);
    await tx.kPIWeeklyValue.deleteMany({ where: { orgId, kpiId: { in: kpiIds } } });
    await tx.kPINote.deleteMany({ where: { orgId, kpiId: { in: kpiIds } } });
    await tx.kPILog.deleteMany({ where: { orgId, kpiId: { in: kpiIds } } });
    await tx.kPI.deleteMany({ where: { orgId, isDemoData: true } });

    const demoPriorities = await tx.priority.findMany({ where: { orgId, isDemoData: true }, select: { id: true } });
    await tx.priorityWeeklyStatus.deleteMany({ where: { priorityId: { in: demoPriorities.map((p) => p.id) } } });
    await tx.priority.deleteMany({ where: { orgId, isDemoData: true } });

    const demoWww = await tx.wWWItem.findMany({ where: { orgId, isDemoData: true }, select: { id: true } });
    const wwwIds = demoWww.map((w) => w.id);
    await tx.wWWRevisionLog.deleteMany({ where: { wwwItemId: { in: wwwIds } } });
    await tx.wWWNote.deleteMany({ where: { orgId, wwwItemId: { in: wwwIds } } });
    await tx.wWWItem.deleteMany({ where: { orgId, isDemoData: true } });

    const demoWeeklyMeetings = await tx.clientWeeklyMeeting.findMany({ where: { orgId, isDemoData: true }, select: { id: true } });
    const weeklyMeetingIds = demoWeeklyMeetings.map((m) => m.id);
    await tx.clientWeeklyMemberScore.deleteMany({ where: { meetingId: { in: weeklyMeetingIds } } });
    await tx.clientWeeklyMeetingLog.deleteMany({ where: { meetingId: { in: weeklyMeetingIds } } });
    await tx.clientWeeklyMeetingAbsence.deleteMany({ where: { meetingId: { in: weeklyMeetingIds } } });
    await tx.clientWeeklyMeetingDashboardNA.deleteMany({ where: { meetingId: { in: weeklyMeetingIds } } });
    await tx.clientWeeklyMeetingTeamAbsence.deleteMany({ where: { meetingId: { in: weeklyMeetingIds } } });
    await tx.clientWeeklyMeetingTeamDashboardNA.deleteMany({ where: { meetingId: { in: weeklyMeetingIds } } });
    await tx.clientWeeklyMeeting.deleteMany({ where: { orgId, isDemoData: true } });

    const demoHuddles = await tx.clientDailyHuddle.findMany({ where: { orgId, isDemoData: true }, select: { id: true } });
    const huddleIds = demoHuddles.map((h) => h.id);
    await tx.clientDailyHuddleAbsence.deleteMany({ where: { huddleId: { in: huddleIds } } });
    await tx.clientDailyHuddleTeamAbsence.deleteMany({ where: { huddleId: { in: huddleIds } } });
    await tx.clientDailyHuddle.deleteMany({ where: { orgId, isDemoData: true } });

    const demoClients = await tx.client.findMany({ where: { orgId, isDemoData: true }, select: { id: true } });
    const clientIds = demoClients.map((c) => c.id);
    await tx.clientTeamMember.deleteMany({ where: { clientId: { in: clientIds } } });
    await tx.clientMembership.deleteMany({ where: { clientId: { in: clientIds } } });
    await tx.client.deleteMany({ where: { orgId, isDemoData: true } });
    await tx.clientMember.deleteMany({ where: { orgId, isDemoData: true } });

    const demoOpsp = await tx.oPSPData.findMany({ where: { orgId, isDemoData: true }, select: { id: true } });
    await tx.oPSPReviewEntry.deleteMany({ where: { opspId: { in: demoOpsp.map((o) => o.id) } } });
    await tx.oPSPData.deleteMany({ where: { orgId, isDemoData: true } });
    await tx.oPSPUserSection.deleteMany({ where: { orgId, isDemoData: true } });
    await tx.oPSPPlan.deleteMany({ where: { orgId, isDemoData: true } });

    const demoHabits = await tx.habitAssessment.findMany({ where: { orgId, isDemoData: true }, select: { id: true } });
    await tx.habitAssessmentResponse.deleteMany({ where: { habitAssessmentId: { in: demoHabits.map((h) => h.id) } } });
    await tx.habitAssessment.deleteMany({ where: { orgId, isDemoData: true } });

    await tx.sWTEntry.deleteMany({ where: { orgId, isDemoData: true } });

    // Children (linked via parentGoalId) before parents.
    await tx.goal.deleteMany({ where: { orgId, isDemoData: true, parentGoalId: { not: null } } });
    await tx.goal.deleteMany({ where: { orgId, isDemoData: true } });

    await tx.accountabilityFunction.deleteMany({ where: { orgId, isDemoData: true, parentFunctionId: { not: null } } });
    await tx.accountabilityFunction.deleteMany({ where: { orgId, isDemoData: true } });

    await tx.qsTeam.deleteMany({ where: { orgId, isDemoData: true, parentTeamId: { not: null } } });
    await tx.qsTeam.deleteMany({ where: { orgId, isDemoData: true } });

    await tx.unitMaster.deleteMany({ where: { orgId, isDemoData: true } });
    await tx.categoryMaster.deleteMany({ where: { orgId, isDemoData: true } });

    // Quarter Settings are normally left alone (an org needs SOME fiscal
    // calendar to function, and deleting it would break real data entered
    // against it — mirrors the app's own "permanently locked once data
    // exists" rule on the Quarter Settings screen). But every isDemoData row
    // has JUST been deleted above, so if the org has zero real content left
    // in any quarter-referencing module, nothing depends on the calendar
    // anymore — it's safe (and expected) to remove the demo quarters too, so
    // Clear All actually leaves the org empty rather than half-cleared.
    const [remainingKpis, remainingPriorities, remainingOpsp, remainingGoals, remainingHabits, remainingSwt] =
      await Promise.all([
        tx.kPI.count({ where: { orgId } }),
        tx.priority.count({ where: { orgId } }),
        tx.oPSPData.count({ where: { orgId } }),
        tx.goal.count({ where: { orgId } }),
        tx.habitAssessment.count({ where: { orgId } }),
        tx.sWTEntry.count({ where: { orgId } }),
      ]);
    const hasRealQuarterReferencingContent =
      remainingKpis + remainingPriorities + remainingOpsp + remainingGoals + remainingHabits + remainingSwt > 0;
    if (!hasRealQuarterReferencingContent) {
      await tx.quarterSetting.deleteMany({ where: { orgId, isDemoData: true } });
    }

    await tx.demoDataState.update({ where: { orgId }, data: { clearedAt: new Date() } });
  });

  return { cleared: true };
}

export async function hasDemoData(orgId: string): Promise<boolean> {
  const state = await db.demoDataState.findUnique({ where: { orgId } });
  return !!state?.seededAt && !state.clearedAt;
}
