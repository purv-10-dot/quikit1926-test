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
  reason?: "already-seeded" | "cleared" | "created" | "org-has-real-data" | "in-progress-or-failed";
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

/**
 * Weekly-value achievement bands, expressed as a percentage of the flat
 * per-week target (`target / weekCount`) — the SAME math the dashboard uses
 * to compute QTD% for Cumulative KPIs (see kpiStats.ts `computeQtd`). Keyed
 * by the KPI's own `healthStatus` label so the generated numbers actually
 * tell the story that label implies (some under-achieved, some on-track,
 * some over), instead of every demo KPI landing on the same inflated,
 * target-independent ratio.
 */
export const ACHIEVEMENT_BAND_PCT: Record<string, [number, number]> = {
  "on-track": [100, 118],
  "at-risk": [78, 98],
  "off-track": [50, 74],
};

export interface DemoWeeklyValues {
  weeks: { weekNumber: number; value: number }[];
  totalAchieved: number;
  currentWeekValue: number;
}

/**
 * Pure generator for a demo KPI's weekly values — split out from
 * `seedDemoDataForOrg` so the achievement-band math is unit-testable without
 * mocking the whole seeding transaction. Source of two real bugs fixed here:
 * every week's value used to be computed off a formula unrelated to the
 * dashboard's own QTD math (uniform ~390% over-achievement regardless of
 * target or healthStatus), and only the trailing `min(currentWeek, 4)` weeks
 * were filled — since `computeQtd()` (kpiStats.ts) sums the flat
 * target/weekCount fallback across EVERY prior week regardless of whether it
 * has a value, leaving early weeks empty dragged every KPI toward "behind"
 * no matter which band it was seeded with.
 */
export function generateDemoWeeklyValues(
  target: number,
  weekCount: number,
  currentWeek: number,
  healthStatus: string,
): DemoWeeklyValues {
  const flatWeeklyTarget = weekCount > 0 ? target / weekCount : 0;
  const [bandLow, bandHigh] = ACHIEVEMENT_BAND_PCT[healthStatus] ?? [90, 110];
  const weeks: { weekNumber: number; value: number }[] = [];
  let totalAchieved = 0;
  let currentWeekValue = 0;
  for (let w = 1; w <= currentWeek; w++) {
    const value = Math.round(flatWeeklyTarget * (randInt(bandLow, bandHigh) / 100) * 100) / 100;
    weeks.push({ weekNumber: w, value });
    totalAchieved += value;
    currentWeekValue = value;
  }
  return { weeks, totalAchieved, currentWeekValue };
}

export async function seedDemoDataForOrg(orgId: string, adminUserId: string): Promise<SeedDemoDataResult> {
  const state = await db.demoDataState.findUnique({ where: { orgId } });
  if (state?.clearedAt) return { seeded: false, reason: "cleared" };
  if (state?.seededAt) return { seeded: false, reason: "already-seeded" };
  // A row with neither timestamp is a claim that never completed — either a
  // concurrent call is mid-transaction right now, or a previous attempt threw.
  // Either way this call must NOT start a second seeding run. See the failure
  // handling at the bottom of this function for why the claim is deliberately
  // left behind rather than released.
  if (state) return { seeded: false, reason: "in-progress-or-failed" };

  // Emptiness guard. `DemoDataState` alone is NOT a reliable "is this org
  // new?" signal: every org created before this table existed has no row, and
  // so does any org whose row was deleted. Those orgs are full of real,
  // user-authored content — and seeding writes fixed names into namespaces
  // the user owns (AccountabilityFunction is unique on `orgId,chartType,name`,
  // UnitMaster on `orgId,nameKey`, Client on `orgId,name`, OPSPPlan on
  // `orgId,userId`), so the run dies on P2002 partway through. Root cause of a
  // real bug: an org with 565 KPIs and a hand-created FACe function named
  // "Sales" failed seeding on EVERY dashboard render.
  //
  // `findFirst` over `orgId`-indexed tables, short-circuited — and it runs at
  // most once per org, because the outcome is recorded as `clearedAt` below.
  const realContent = await Promise.all([
    db.kPI.findFirst({ where: { orgId, isDemoData: false }, select: { id: true } }),
    db.priority.findFirst({ where: { orgId, isDemoData: false }, select: { id: true } }),
    db.wWWItem.findFirst({ where: { orgId, isDemoData: false }, select: { id: true } }),
    db.client.findFirst({ where: { orgId, isDemoData: false }, select: { id: true } }),
    db.accountabilityFunction.findFirst({ where: { orgId, isDemoData: false }, select: { id: true } }),
    db.oPSPData.findFirst({ where: { orgId, isDemoData: false }, select: { id: true } }),
    db.qsTeam.findFirst({ where: { orgId, isDemoData: false }, select: { id: true } }),
  ]);
  if (realContent.some(Boolean)) {
    // Record the decision so this check is never repeated for this org, and so
    // demo data can never appear later on top of real content.
    await db.demoDataState.create({ data: { orgId, clearedAt: new Date() } }).catch(() => {});
    return { seeded: false, reason: "org-has-real-data" };
  }

  // Atomically claim the seed slot before touching any other table. This
  // layout runs on every server-rendered hit (force-dynamic) and Next.js
  // fires more than one of those per navigation (the page request plus link
  // prefetches) — without a claim, two concurrent calls both pass the check
  // above, both open their own `$transaction` below, and the second one dies
  // deep inside it on an unrelated unique constraint (e.g. AccountabilityFunction
  // `orgId,chartType,name`). `orgId` is `@unique` on DemoDataState, so the
  // loser's `create` throws P2002 right here instead — clean, cheap bailout.
  try {
    await db.demoDataState.create({ data: { orgId } });
  } catch (err) {
    if ((err as { code?: string } | null)?.code === "P2002") {
      return { seeded: false, reason: "already-seeded" };
    }
    throw err;
  }

  const now = new Date();

  try {
    await db.$transaction(async (tx) => {
    // --- Org Setup: Quarter Settings (prerequisite for every other module) --
    const { year, quarter, currentWeek, weekCount } = await ensureQuarterContext(tx, orgId, adminUserId);

    // --- Org Setup: Teams + Unit Master ---------------------------------
    const salesTeam = await tx.qsTeam.create({
      data: { orgId, name: "Demo Sales", slug: `demo-sales-${orgId.slice(0, 6)}`, color: "#10b981", createdBy: adminUserId, isDemoData: true },
    });
    const engineeringTeam = await tx.qsTeam.create({
      data: { orgId, name: "Demo Engineering", slug: `demo-engineering-${orgId.slice(0, 6)}`, color: "#3b82f6", createdBy: adminUserId, isDemoData: true },
    });

    await tx.unitMaster.createMany({
      data: [
        // "Demo " prefix is load-bearing, not cosmetic: UnitMaster is unique
        // on (orgId, nameKey), and "Leads"/"Calls"/"Hours" are exactly what a
        // real user names their units. Matches QsTeam/CategoryMaster below.
        { orgId, name: "Demo Leads", nameKey: "demo leads", createdBy: adminUserId, isDemoData: true },
        { orgId, name: "Demo Calls", nameKey: "demo calls", createdBy: adminUserId, isDemoData: true },
        { orgId, name: "Demo Hours", nameKey: "demo hours", createdBy: adminUserId, isDemoData: true },
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

      const { weeks, totalAchieved, currentWeekValue } = generateDemoWeeklyValues(
        def.target,
        weekCount,
        currentWeek,
        def.healthStatus,
      );
      for (const { weekNumber, value } of weeks) {
        await tx.kPIWeeklyValue.create({
          data: {
            orgId,
            kpiId: kpi.id,
            userId: adminUserId,
            weekNumber,
            value,
            createdBy: adminUserId,
          },
        });
      }

      // The weekly-save routes (app/api/kpi/[id]/weekly[/batch]) recompute
      // and persist qtdAchieved/progressPercent/currentWeekValue after every
      // save. Demo rows are inserted directly via `tx.kPIWeeklyValue.create`
      // above, bypassing that — left alone, `qtdAchieved` stays permanently
      // null despite having real weekly values, which makes the dashboard's
      // QTD badge fall back to its "no data entered" grey state.
      if (weeks.length > 0) {
        const progressPercent = def.target > 0 ? (totalAchieved / def.target) * 100 : 0;
        await tx.kPI.update({
          where: { id: kpi.id },
          data: { qtdAchieved: totalAchieved, progressPercent, currentWeekValue },
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
    // Fills every section of the Create OPSP form (not just a few headline
    // fields) so the page reads as a real, filled-in plan rather than mostly
    // placeholder text. Shapes below mirror FormData / TargetRow / GoalRow /
    // etc. in app/(dashboard)/opsp/types.ts exactly — the DB's JSON columns
    // are consumed as-is by the client, no server-side reshaping.
    const opspCategories = ["Demo Revenue", "Demo Operations", "Demo Customer"];
    const critCard = (title: string, bullets: string[]) => ({ title, bullets });

    await tx.oPSPData.create({
      data: {
        orgId,
        userId: adminUserId,
        year,
        quarter,
        status: "draft",
        employees: ["Weekly all-hands with live scorecard", "Quarterly 360 reviews", "Referral bonus program"],
        customers: ["NPS survey every quarter", "Dedicated success manager for top accounts", "Public roadmap"],
        shareholders: ["Monthly investor update email", "Board deck published within 5 days of quarter close", "Cap table reviewed annually"],
        coreValues: "Customer obsession, ownership, integrity",
        purpose: "Help growing businesses run a disciplined weekly performance rhythm.",
        actions: [
          "Publish core values on the intranet homepage",
          "Recognize a values-driven win in every all-hands",
          "Tie BHAG progress to the quarterly scorecard",
          "Review purpose statement at every offsite",
          "Onboard new hires with a purpose/values session",
        ],
        profitPerX: "₹8L profit per employee",
        bhag: "₹100 Cr ARR by 2030",
        targetRows: [0, 1, 2, 3, 4].map((i) => ({
          category: opspCategories[i % opspCategories.length],
          projected: String(100 + i * 50),
          y1: String(20 + i * 10), y2: String(35 + i * 12), y3: String(55 + i * 14), y4: String(80 + i * 16), y5: String(100 + i * 18),
        })),
        sandbox: "Explore expansion into the SMB segment via a self-serve tier.",
        keyThrusts: [
          { desc: "Launch self-serve onboarding", owner: "Demo Admin" },
          { desc: "Expand into 2 new verticals", owner: "Demo Admin" },
          { desc: "Build partner referral channel", owner: "Demo Admin" },
          { desc: "Stand up 24/7 support", owner: "Demo Admin" },
          { desc: "Ship mobile app v1", owner: "Demo Admin" },
        ],
        brandPromiseKPIs: "Response time < 2h, CSAT > 90%, Uptime > 99.9%",
        brandPromise: "Disciplined weekly rhythm that turns strategy into shipped work — every week, no exceptions.",
        goalRows: [0, 1, 2, 3, 4, 5].map((i) => ({
          category: opspCategories[i % opspCategories.length],
          projected: String(20 + i * 5),
          q1: String(2 + i), q2: String(5 + i), q3: String(9 + i), q4: String(14 + i),
        })),
        keyInitiatives: [
          { desc: "Close 5 enterprise deals", owner: "Demo Admin" },
          { desc: "Ship v2 of the customer portal", owner: "Demo Admin" },
          { desc: "Hire 2 senior engineers", owner: "Demo Admin" },
          { desc: "Launch partner program", owner: "Demo Admin" },
          { desc: "Reduce churn to under 3%", owner: "Demo Admin" },
        ],
        criticalNumGoals: critCard("Qualified Pipeline (₹Cr)", ["4", "3", "2", "1"]),
        balancingCritNumGoals: critCard("Team Utilization (%)", ["85", "80", "75", "70"]),
        processItems: ["Weekly pipeline review", "Bi-weekly sprint demo", "Monthly ops retro"],
        weaknesses: ["No dedicated QA function yet", "Support coverage is US-hours only", "Onboarding docs are outdated"],
        makeBuy: ["Build core product in-house", "Buy payments via Stripe", "Buy analytics via a SaaS tool"],
        sell: ["Direct sales for enterprise", "Self-serve for SMB", "Partner-led for mid-market"],
        recordKeeping: ["Cloud accounting platform", "Automated invoicing", "Quarterly external audit"],
        actionsQtr: [0, 1, 2, 3, 4, 5].map((i) => ({
          category: opspCategories[i % opspCategories.length],
          projected: String(10 + i * 3),
          m1: String(2 + i), m2: String(5 + i), m3: String(9 + i),
        })),
        rocks: [
          { desc: "Ship v2 of the customer portal", owner: "Demo Admin" },
          { desc: "Close 5 enterprise deals", owner: "Demo Admin" },
          { desc: "Hire 2 senior engineers", owner: "Demo Admin" },
          { desc: "Launch partner referral program", owner: "Demo Admin" },
          { desc: "Reduce weekly bug backlog by 40%", owner: "Demo Admin" },
        ],
        criticalNumProcess: critCard("Cycle Time (days)", ["3", "5", "7", "10"]),
        balancingCritNumProcess: critCard("Defect Rate (%)", ["1", "2", "4", "6"]),
        theme: "Momentum — every week compounds.",
        scoreboardDesign: "Shared TV dashboard in the office + Slack digest every Friday.",
        celebration: "Team lunch + shoutout in all-hands when a Rock is completed.",
        reward: "Spot bonus for the quarter's top-contributing Rock owner.",
        trends: [
          "Customers increasingly asking for SSO",
          "Support tickets trending down 15% QoQ",
          "Sales cycle shortening as brand awareness grows",
          "Competitor pricing pressure in the SMB segment",
          "Hiring market loosening for senior engineers",
          "Rising demand for usage-based pricing",
        ],
        createdBy: adminUserId,
        isDemoData: true,
      },
    });
    // OPSPUserSection is unique on (orgId, userId, year, quarter) and OPSPPlan
    // on (orgId, userId) — both keyed to the SEEDING ADMIN, so unlike every
    // other table here a name prefix can't keep them out of the user's way.
    // The emptiness guard above catches the common case, but an admin can
    // legitimately have filled in their own OPSP page before any other module
    // has a single row. Skip rather than clash.
    const existingSection = await tx.oPSPUserSection.findUnique({
      where: { orgId_userId_year_quarter: { orgId, userId: adminUserId, year, quarter } },
      select: { id: true },
    });
    if (!existingSection) await tx.oPSPUserSection.create({
      data: {
        orgId,
        userId: adminUserId,
        year,
        quarter,
        kpiAccountability: [
          { kpi: "Monthly Revenue", goal: "₹15L" },
          { kpi: "Customer NPS", goal: "80" },
          { kpi: "Tickets Resolved", goal: "50" },
          { kpi: "Bug Fixes Shipped", goal: "25" },
          { kpi: "Sales Calls Made", goal: "60" },
        ],
        quarterlyPriorities: [
          { priority: "Close 5 enterprise deals", dueDate: "" },
          { priority: "Ship v2 of the customer portal", dueDate: "" },
          { priority: "Hire 2 senior engineers", dueDate: "" },
          { priority: "Launch partner referral program", dueDate: "" },
          { priority: "Reduce weekly bug backlog by 40%", dueDate: "" },
        ],
        criticalNumAcct: critCard("Weekly Active Users", ["1200", "1000", "800", "600"]),
        balancingCritNumAcct: critCard("Support Response Time (hrs)", ["1", "2", "4", "8"]),
        createdBy: adminUserId,
        isDemoData: true,
      },
    });
    const existingPlan = await tx.oPSPPlan.findUnique({
      where: { orgId_userId: { orgId, userId: adminUserId } },
      select: { id: true },
    });
    if (!existingPlan) await tx.oPSPPlan.create({
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
    // Every name here is "Demo "-prefixed on purpose: AccountabilityFunction is
    // unique on (orgId, chartType, name), and bare "Leadership"/"Sales" are the
    // first two functions any real org creates by hand.
    const faceParent = await tx.accountabilityFunction.create({
      data: { orgId, name: "Demo Leadership", chartType: "face", assignedToUserId: adminUserId, isDemoData: true },
    });
    await tx.accountabilityFunction.create({
      data: { orgId, name: "Demo Sales", chartType: "face", parentFunctionId: faceParent.id, teamId: salesTeam.id, assignedToUserId: adminUserId, isDemoData: true },
    });
    const paceParent = await tx.accountabilityFunction.create({
      data: {
        orgId,
        name: "Demo Close 5 enterprise deals",
        chartType: "pace",
        assignedToUserId: adminUserId,
        expectedOutcomes: "₹4Cr in new ARR this quarter",
        isDemoData: true,
      },
    });
    await tx.accountabilityFunction.create({
      data: {
        orgId,
        name: "Demo Ship v2 customer portal",
        chartType: "pace",
        parentFunctionId: paceParent.id,
        teamId: engineeringTeam.id,
        assignedToUserId: adminUserId,
        leadingIndicators: `${randInt(60, 90)}% of sprint velocity`,
        isDemoData: true,
      },
    });

    });
  } catch (err) {
    // The claim row is deliberately LEFT IN PLACE (seededAt + clearedAt both
    // null), so the guard at the top of this function bails out on every
    // subsequent call with "in-progress-or-failed".
    //
    // It used to be deleted here so a failed run could "retry cleanly". That
    // was wrong: nothing about a failure is transient in practice — the usual
    // cause is a unique-constraint clash with a row the user owns, which is
    // still there next request. Releasing the claim turned that into a retry
    // storm: this runs from the force-dynamic dashboard layout, so EVERY
    // navigation re-opened a ~40-write transaction and rolled it back.
    //
    // The transaction rolled back, so no partial demo rows exist. To retry
    // after fixing the underlying cause, delete the org's DemoDataState row.
    console.error("[demo-data] seeding transaction failed; claim retained to prevent retry storm", {
      orgId,
      error: err,
    });
    throw err;
  }

  await db.demoDataState.update({ where: { orgId }, data: { seededAt: now } });
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
