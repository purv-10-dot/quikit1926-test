/**
 * Smoke test the new Scaling-Up talent pipeline end-to-end against the prod DB:
 *  1. Read auto signals for a known demo user (qs.alice — manager in demo Engineering).
 *  2. Save a TalentAssessment with manager judgments + verify classification + autoSignals snapshot.
 *  3. Re-read and print the stored row.
 */
import { PrismaClient } from "@prisma/client";
import { classifyTalent, computePerformanceScore } from "../lib/schemas/talentSchema";

const db = new PrismaClient();

(async () => {
  const org = await db.org.findUnique({ where: { slug: "moreyeahs" } });
  if (!org) throw new Error("moreyeahs org not found");

  const user = await db.user.findUnique({ where: { email: "qs.alice@example.com" } });
  if (!user) throw new Error("qs.alice not found");
  const assessor = await db.user.findUnique({ where: { email: "qs.admin@example.com" } });
  if (!assessor) throw new Error("qs.admin not found");

  // ── 1. Auto signals ──
  const SINCE = new Date(Date.now() - 90 * 86_400_000);
  const [member, kpiAgg, priorities, totalH, absentH, totalW, absentW, lastReview, seats] = await Promise.all([
    db.orgMember.findFirst({ where: { orgId: org.id, userId: user.id }, include: { team: true } }),
    db.kPI.aggregate({ where: { orgId: org.id, owner: user.id }, _avg: { progressPercent: true }, _count: true }),
    db.priority.findMany({ where: { orgId: org.id, owner: user.id }, select: { overallStatus: true } }),
    db.clientDailyHuddle.count({ where: { orgId: org.id, meetingDate: { gte: SINCE } } }),
    db.clientDailyHuddleAbsence.count({ where: { userId: user.id, huddle: { orgId: org.id } } }),
    db.clientWeeklyMeeting.count({ where: { orgId: org.id, meetingDate: { gte: SINCE } } }),
    db.clientWeeklyMeetingAbsence.count({ where: { userId: user.id, meeting: { orgId: org.id } } }),
    db.performanceReview.findFirst({ where: { orgId: org.id, revieweeId: user.id }, orderBy: [{ year: "desc" }, { quarter: "desc" }] }),
    db.accountabilityFunction.findMany({ where: { orgId: org.id, assignedToUserId: user.id }, select: { name: true } }),
  ]);

  const kpiScore = kpiAgg._avg.progressPercent ?? null;
  const completedP = priorities.filter((p) => p.overallStatus === "completed").length;
  const priorityScore = priorities.length > 0 ? (completedP / priorities.length) * 100 : null;
  const huddlePct = totalH > 0 ? Math.max(0, Math.round(((totalH - absentH) / totalH) * 100)) : null;
  const weeklyPct = totalW > 0 ? Math.max(0, Math.round(((totalW - absentW) / totalW) * 100)) : null;

  console.log("── Auto signals for", user.firstName, user.lastName, "──");
  console.log(`  KPI hit:        ${kpiScore?.toFixed(0)}% (${kpiAgg._count} KPIs)`);
  console.log(`  Priorities:     ${priorityScore?.toFixed(0)}% (${priorities.length} total, ${completedP} completed)`);
  console.log(`  Daily huddles:  ${huddlePct}% (${totalH - absentH}/${totalH} last 90d)`);
  console.log(`  Weekly mtgs:    ${weeklyPct}% (${totalW - absentW}/${totalW} last 90d)`);
  console.log(`  Last review:    ${lastReview?.overallScore} (${lastReview?.quarter} ${lastReview?.year})`);
  console.log(`  Seats owned:    ${seats.length} → ${seats.map((s) => s.name).join(", ")}`);
  console.log(`  Tenure:         ${member?.createdAt ? Math.floor((Date.now() - new Date(member.createdAt).getTime()) / 86_400_000) : "?"} days`);

  const performanceScore = computePerformanceScore({
    kpiScore: kpiScore !== null ? Math.round(kpiScore) : null,
    priorityScore: priorityScore !== null ? Math.round(priorityScore) : null,
    huddleAttendancePct: huddlePct,
  });
  console.log(`\n  → Composite performance (shared helper): ${performanceScore}%   [weights KPI 50% / Priority 30% / Huddles 20%, weekly meetings ignored]`);

  // ── 2. Save assessment ──
  const rehireDecision = "enthusiastic";
  const coreValuesScore = 5;
  const classification = classifyTalent({ rehireDecision, coreValuesScore, performanceScore });
  console.log(`\n── Classifying with rehire=enthusiastic, cv=5, perf=${performanceScore}% → ${classification}`);

  const saved = await db.talentAssessment.upsert({
    where: { orgId_userId_quarter_year: { orgId: org.id, userId: user.id, quarter: "Q1", year: 2026 } },
    create: {
      orgId: org.id, userId: user.id, assessorId: assessor.id,
      quarter: "Q1", year: 2026,
      rehireDecision, rightSeat: "yes", coreValuesScore, capacity: "right-sized",
      doMore: "Lead the v2 portal launch end-to-end", doLess: "Less time in code review (delegate)",
      classification,
      autoSignals: { kpiScore, priorityScore, huddlePct, weeklyPct, performanceScore, capturedAt: new Date().toISOString() },
    },
    update: {
      assessorId: assessor.id,
      rehireDecision, rightSeat: "yes", coreValuesScore, capacity: "right-sized",
      doMore: "Lead the v2 portal launch end-to-end", doLess: "Less time in code review (delegate)",
      classification,
      autoSignals: { kpiScore, priorityScore, huddlePct, weeklyPct, performanceScore, capturedAt: new Date().toISOString() },
    },
  });

  console.log("\n── Stored assessment ──");
  console.log(JSON.stringify({
    id: saved.id, classification: saved.classification, rehireDecision: saved.rehireDecision,
    coreValuesScore: saved.coreValuesScore, capacity: saved.capacity,
    autoSignals: saved.autoSignals,
  }, null, 2));

  await db.$disconnect();
})();
