/**
 * QuikScale — extra dummy data on top of seed-dummy.ts.
 *
 * Adds Clients + meetings, OPSP, Performance (reviews/goals/1-on-1s/talent/feedback),
 * Surveys + responses, Habit Assessments, SWT entries, and KPI notes/logs to the
 * existing "demo-quikscale" org.
 *
 * Idempotent: wipes only the extras scoped to demo-quikscale before re-seeding.
 *
 * Run:
 *   npx tsx scripts/seed-dummy-extras.ts
 *   (DATABASE_URL must be set; run from apps/quikscale)
 */

import { PrismaClient, Prisma } from "@prisma/client";

const db = new PrismaClient();

const ORG_SLUG = "moreyeahs";

// All demo user accounts share this email pattern — used to scope wipes safely.
const DEMO_EMAILS = [
  "qs.admin@example.com",
  "qs.alice@example.com",
  "qs.bob@example.com",
  "qs.carol@example.com",
  "qs.david@example.com",
  "qs.eva@example.com",
  "qs.frank@example.com",
  "qs.grace@example.com",
];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const CLIENT_TEMPLATES = [
  {
    name: "Demo Acme Industries",
    description: "Long-time success-alchemist client, manufacturing vertical",
    weekly: { start: "10:00", end: "11:00" },
    daily: { start: "09:30", end: "09:45" },
  },
  {
    name: "Demo Globex Corp",
    description: "Mid-market SaaS client, OPSP coaching active",
    weekly: { start: "14:00", end: "15:00" },
    daily: { start: "10:00", end: "10:15" },
  },
  {
    name: "Demo Initech LLC",
    description: "Recently onboarded enterprise client",
    weekly: { start: "11:30", end: "12:30" },
    daily: { start: "09:00", end: "09:15" },
  },
];

const DEMO_CLIENT_NAMES = CLIENT_TEMPLATES.map((c) => c.name);

const CLIENT_MEMBERS = [
  { name: "Rajesh Kumar", email: "rajesh.kumar@acmeind.example.com", client: "Demo Acme Industries" },
  { name: "Priya Nair", email: "priya.nair@acmeind.example.com", client: "Demo Acme Industries" },
  { name: "Vikram Patel", email: "vikram.patel@acmeind.example.com", client: "Demo Acme Industries" },
  { name: "Sarah Chen", email: "sarah.chen@globex.example.com", client: "Demo Globex Corp" },
  { name: "Marcus Lee", email: "marcus.lee@globex.example.com", client: "Demo Globex Corp" },
  { name: "Jenny Wong", email: "jenny.wong@globex.example.com", client: "Demo Globex Corp" },
  { name: "Tom Anderson", email: "tom.anderson@initech.example.com", client: "Demo Initech LLC" },
  { name: "Lisa Park", email: "lisa.park@initech.example.com", client: "Demo Initech LLC" },
];

const DEMO_CLIENT_MEMBER_EMAILS = CLIENT_MEMBERS.map((m) => m.email);

const HUDDLE_NOTES = [
  "Blocker on payment gateway integration — escalated to platform team.",
  "Sprint demo well received. Stakeholders signed off on Q1 milestones.",
  "Discussed customer-onboarding bottleneck. Will revisit Thursday.",
  "Quick sync, no major updates. Continued on weekly priorities.",
  "Risk identified around vendor dependency. Mitigation owner: Aanya.",
];

const WEEKLY_NOTES = [
  "Strong week — KPIs trending green, 2 priorities moved to 'on-track'.",
  "OPSP review caught a gap in the 90-day rocks. Reset two priorities.",
  "Mixed week. Sales pipeline solid but engineering velocity dipped.",
  "Solid execution. Celebrated quarterly milestone achievement.",
];

const STRENGTHS = [
  "Exceptional ownership of customer escalations.",
  "Strong technical leadership, mentors juniors well.",
  "Closes deals with surgical precision — high conversion rate.",
  "Brings clarity to ambiguous initiatives.",
  "Highly reliable — always delivers what they commit.",
];

const IMPROVEMENTS = [
  "Could delegate more aggressively to free up strategic bandwidth.",
  "Documentation lags behind shipped work — close the loop sooner.",
  "Take more risks on stretch goals — current targets are conservative.",
  "Communicate blockers earlier in the cycle.",
];

const GOAL_TITLES = [
  "Hit $1.5M ARR by end of quarter",
  "Reduce P0 incident count by 50%",
  "Launch self-serve onboarding for SMB tier",
  "Achieve 4.5+ avg performance review score",
  "Complete leadership training program",
  "Migrate 3 legacy modules to new stack",
];

const FEEDBACK_BODIES = [
  "Great job leading the launch — your calm under pressure set the tone.",
  "Loved the way you broke down the proposal for the client. Keep it up.",
  "Suggestion: try pairing more on the harder reviews — quality + velocity both win.",
  "Thanks for stepping up on the on-call rotation — really appreciated.",
];

const HABIT_NOTES = [
  "Strong on rhythm and meetings; recognition needs more deliberate practice.",
  "Vision crisp and shared widely. Cascading goals showing real traction.",
  "Scoreboards are visible but stale in 2 teams — refresh weekly.",
];

const SWT_CONTENT = {
  strength: [
    "Differentiated brand positioning in mid-market segment.",
    "Strong engineering bench, low attrition.",
    "Proven OPSP coaching playbook for clients.",
  ],
  weakness: [
    "Slow ticket triage on critical bugs.",
    "Dependency on a single key vendor.",
  ],
  trend: [
    "AI-augmented coaching tools gaining traction with younger clients.",
    "Shift toward weekly cadence over monthly reviews.",
  ],
};

async function main() {
  console.log("🌱 Seeding QuikScale extras (Clients, OPSP, Performance, Surveys)…\n");

  const org = await db.org.findUnique({ where: { slug: ORG_SLUG } });
  if (!org) throw new Error(`Org "${ORG_SLUG}" not found — run seed-dummy.ts first`);

  // Only consider demo users (not real Moreyeahs members) so we never wipe real data.
  const members = await db.orgMember.findMany({
    where: { orgId: org.id, status: "active", user: { email: { in: DEMO_EMAILS } } },
    select: { userId: true, role: true, user: { select: { email: true, firstName: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (members.length === 0) throw new Error("No demo members found in this org — run seed-dummy.ts first");

  const adminId = members.find((m) => m.role === "admin")?.userId ?? members[0]!.userId;
  const managers = members.filter((m) => m.role === "manager");
  const employees = members.filter((m) => m.role === "employee");
  const userIds = members.map((m) => m.userId);

  // Wipe extras — scoped strictly to demo users / demo client names so real Moreyeahs data is untouched.
  console.log("🧨 Wiping extras (scoped to demo users + demo entities only)…");
  await db.$transaction([
    db.clientWeeklyMemberScore.deleteMany({ where: { meeting: { orgId: org.id, client: { name: { in: DEMO_CLIENT_NAMES } } } } }),
    db.clientWeeklyMeetingTeamDashboardNA.deleteMany({ where: { meeting: { orgId: org.id, client: { name: { in: DEMO_CLIENT_NAMES } } } } }),
    db.clientWeeklyMeetingTeamAbsence.deleteMany({ where: { meeting: { orgId: org.id, client: { name: { in: DEMO_CLIENT_NAMES } } } } }),
    db.clientWeeklyMeetingDashboardNA.deleteMany({ where: { meeting: { orgId: org.id, client: { name: { in: DEMO_CLIENT_NAMES } } } } }),
    db.clientWeeklyMeetingAbsence.deleteMany({ where: { meeting: { orgId: org.id, client: { name: { in: DEMO_CLIENT_NAMES } } } } }),
    db.clientWeeklyMeetingLog.deleteMany({ where: { orgId: org.id, meeting: { client: { name: { in: DEMO_CLIENT_NAMES } } } } }),
    db.clientWeeklyMeeting.deleteMany({ where: { orgId: org.id, client: { name: { in: DEMO_CLIENT_NAMES } } } }),
    db.clientDailyHuddleTeamAbsence.deleteMany({ where: { huddle: { orgId: org.id, client: { name: { in: DEMO_CLIENT_NAMES } } } } }),
    db.clientDailyHuddleAbsence.deleteMany({ where: { huddle: { orgId: org.id, client: { name: { in: DEMO_CLIENT_NAMES } } } } }),
    db.clientDailyHuddle.deleteMany({ where: { orgId: org.id, client: { name: { in: DEMO_CLIENT_NAMES } } } }),
    db.clientTeamMember.deleteMany({ where: { orgId: org.id, client: { name: { in: DEMO_CLIENT_NAMES } } } }),
    db.clientMembership.deleteMany({ where: { orgId: org.id, client: { name: { in: DEMO_CLIENT_NAMES } } } }),
    db.clientMember.deleteMany({ where: { orgId: org.id, email: { in: DEMO_CLIENT_MEMBER_EMAILS } } }),
    db.client.deleteMany({ where: { orgId: org.id, name: { in: DEMO_CLIENT_NAMES } } }),
    db.oPSPReviewEntry.deleteMany({ where: { orgId: org.id, userId: { in: userIds } } }),
    db.oPSPData.deleteMany({ where: { orgId: org.id, userId: { in: userIds } } }),
    db.oPSPSection.deleteMany({ where: { document: { orgId: org.id, createdBy: { in: userIds } } } }),
    db.oPSPDocument.deleteMany({ where: { orgId: org.id, createdBy: { in: userIds } } }),
    db.oPSPPlan.deleteMany({ where: { orgId: org.id, userId: { in: userIds } } }),
    db.surveyResponse.deleteMany({ where: { survey: { orgId: org.id, createdBy: { in: userIds } } } }),
    db.survey.deleteMany({ where: { orgId: org.id, createdBy: { in: userIds } } }),
    db.habitAssessment.deleteMany({ where: { orgId: org.id, assessedBy: { in: userIds } } }),
    db.sWTEntry.deleteMany({ where: { orgId: org.id, createdBy: { in: userIds } } }),
    db.performanceReview.deleteMany({ where: { orgId: org.id, revieweeId: { in: userIds } } }),
    db.talentAssessment.deleteMany({ where: { orgId: org.id, userId: { in: userIds } } }),
    db.oneOnOne.deleteMany({ where: { orgId: org.id, OR: [{ managerId: { in: userIds } }, { reportId: { in: userIds } }] } }),
    db.feedbackEntry.deleteMany({ where: { orgId: org.id, OR: [{ fromUserId: { in: userIds } }, { toUserId: { in: userIds } }] } }),
    db.goal.deleteMany({ where: { orgId: org.id, ownerId: { in: userIds } } }),
    db.kPINote.deleteMany({ where: { orgId: org.id, authorId: { in: userIds } } }),
    db.kPILog.deleteMany({ where: { orgId: org.id, changedBy: { in: userIds } } }),
  ]);

  // === Clients + Members + Meetings ===
  const clientIds: Record<string, string> = {};
  for (const t of CLIENT_TEMPLATES) {
    const client = await db.client.create({
      data: {
        orgId: org.id,
        name: t.name,
        description: t.description,
        startDate: new Date(Date.now() - 90 * 86_400_000),
        weeklyStartTime: t.weekly.start,
        weeklyEndTime: t.weekly.end,
        dailyStartTime: t.daily.start,
        dailyEndTime: t.daily.end,
        createdBy: adminId,
      },
    });
    clientIds[t.name] = client.id;
  }
  console.log(`✅ Clients: ${CLIENT_TEMPLATES.length}`);

  const memberIds: Record<string, string> = {};
  for (const m of CLIENT_MEMBERS) {
    const cm = await db.clientMember.create({
      data: { orgId: org.id, name: m.name, email: m.email, createdBy: adminId },
    });
    memberIds[m.email] = cm.id;
    await db.clientTeamMember.create({
      data: { orgId: org.id, clientId: clientIds[m.client]!, clientMemberId: cm.id },
    });
  }
  console.log(`✅ Client Members: ${CLIENT_MEMBERS.length}`);

  // Link some tenant users as ClientMemberships (account managers)
  const accountManagers = [adminId, ...managers.map((m) => m.userId)];
  let mIdx = 0;
  for (const cName of Object.keys(clientIds)) {
    const userId = accountManagers[mIdx % accountManagers.length]!;
    await db.clientMembership.create({
      data: { orgId: org.id, clientId: clientIds[cName]!, userId, clientRole: "Account Manager" },
    });
    mIdx++;
  }

  // Daily huddles — last 14 days per client
  let huddleCount = 0;
  for (const cName of Object.keys(clientIds)) {
    const clientMembersForClient = CLIENT_MEMBERS.filter((m) => m.client === cName).map(
      (m) => memberIds[m.email]!,
    );
    for (let d = 1; d <= 14; d++) {
      const date = new Date(Date.now() - d * 86_400_000);
      if (date.getDay() === 0 || date.getDay() === 6) continue;
      const status = rand(["HELD", "HELD", "HELD", "NOT_HELD"] as const);
      const huddle = await db.clientDailyHuddle.create({
        data: {
          orgId: org.id,
          clientId: clientIds[cName]!,
          meetingDate: date,
          callStatus: status,
          actualStartTime: status === "HELD" ? "09:30" : null,
          actualEndTime: status === "HELD" ? "09:46" : null,
          format1Status: rand(["YES", "YES", "NO"] as const),
          format2Status: rand(["YES", "NA"] as const),
          stuckCallStatus: rand(["YES", "NA"] as const),
          punctualityOverride: rand(["YES", "NO"] as const),
          totalMembers: clientMembersForClient.length,
          notes: rand(HUDDLE_NOTES),
          createdBy: adminId,
        },
      });
      // Random absent member (sometimes)
      if (status === "HELD" && clientMembersForClient.length > 0 && Math.random() < 0.3) {
        const absentee = rand(clientMembersForClient);
        await db.clientDailyHuddleTeamAbsence.create({
          data: { huddleId: huddle.id, clientMemberId: absentee },
        });
      }
      huddleCount++;
    }
  }
  console.log(`✅ Daily Huddles: ${huddleCount}`);

  // Weekly meetings — last 8 weeks per client
  let meetingCount = 0;
  let scoreCount = 0;
  for (const cName of Object.keys(clientIds)) {
    const clientMembersForClient = CLIENT_MEMBERS.filter((m) => m.client === cName).map(
      (m) => memberIds[m.email]!,
    );
    for (let w = 1; w <= 8; w++) {
      const date = new Date(Date.now() - w * 7 * 86_400_000);
      const meeting = await db.clientWeeklyMeeting.create({
        data: {
          orgId: org.id,
          clientId: clientIds[cName]!,
          meetingDate: date,
          callStatus: "HELD",
          actualStartTime: "10:00",
          actualEndTime: "11:00",
          segmentTime1: "00:05",
          segmentTime2: "00:10",
          segmentTime3: "00:15",
          segmentTime4: "00:10",
          segmentTime5: "00:10",
          segmentTime6: "00:05",
          segmentTime7: "00:05",
          goodNewsSharing: "YES",
          kpDashboard: rand(["YES", "NO"] as const),
          gaps: rand(["YES", "NO"] as const),
          www: "YES",
          feedback: rand(["YES", "NA"] as const),
          collectiveIntelligence: rand(["YES", "NA"] as const),
          opspReview: rand(["YES", "NO"] as const),
          notesKPDashboard: "All KPIs reviewed. 2 in red — recovery plan agreed.",
          otherNotes: rand(WEEKLY_NOTES),
          createdBy: adminId,
        },
      });
      meetingCount++;

      for (const cmId of clientMembersForClient) {
        await db.clientWeeklyMemberScore.create({
          data: {
            meetingId: meeting.id,
            clientMemberId: cmId,
            kpiWeeklyQTD: randInt(60, 100),
            kpiCoding: randInt(60, 100),
            priorityNotes: randInt(50, 100),
            priorityStartEndDate: randInt(50, 100),
            priorityColor: randInt(50, 100),
          },
        });
        scoreCount++;
      }
    }
  }
  console.log(`✅ Weekly Meetings: ${meetingCount}`);
  console.log(`✅ Weekly Member Scores: ${scoreCount}`);

  // === OPSP ===
  const year = new Date().getFullYear();
  // Use a high version number so we never collide with real Moreyeahs OPSP documents.
  const existingDocs = await db.oPSPDocument.findMany({
    where: { orgId: org.id, year },
    select: { versionNumber: true },
    orderBy: { versionNumber: "desc" },
    take: 1,
  });
  const versionNumber = Math.max(900, (existingDocs[0]?.versionNumber ?? 0) + 1);
  const opspDoc = await db.oPSPDocument.create({
    data: {
      orgId: org.id,
      year,
      versionNumber,
      status: "approved",
      approvedBy: adminId,
      approvedAt: new Date(),
      createdBy: adminId,
    },
  });
  const sectionContent: Record<string, string> = {
    purpose: "To help mid-market companies scale their operating rhythm with clarity and confidence.",
    bhag: "Reach $50M in ARR by 2030 through deeply embedded customer success rhythms.",
    coreValues: "Ownership. Clarity. Compounding.",
    brandPromise: "Predictable execution every quarter — or we work for free.",
    profitPerX: "Profit per Active Client Engagement (PCE).",
    sandbox: "Mid-market B2B (50–500 employees) across India and SEA.",
    theme: "Q1 theme: Earned trust through weekly cadence.",
  };
  for (const [key, content] of Object.entries(sectionContent)) {
    await db.oPSPSection.create({
      data: { documentId: opspDoc.id, sectionType: key, content },
    });
  }

  // OPSPData per user (sample for first 4 users)
  let opspDataCount = 0;
  for (const u of [adminId, ...managers.map((m) => m.userId)].slice(0, 4)) {
    await db.oPSPData.create({
      data: {
        orgId: org.id,
        userId: u,
        year,
        quarter: "Q1",
        status: "in-progress",
        targetYears: 5,
        purpose: sectionContent.purpose,
        bhag: sectionContent.bhag,
        coreValues: sectionContent.coreValues,
        brandPromise: sectionContent.brandPromise,
        theme: sectionContent.theme,
        rocks: [
          { name: "Launch v2 portal", owner: "Aanya", status: "on-track" },
          { name: "Close 5 enterprise deals", owner: "Bob", status: "behind-schedule" },
        ] as Prisma.InputJsonValue,
        quarterlyPriorities: [
          { name: "Migrate CRM", owner: "Alice" },
          { name: "Hire 2 SREs", owner: "Aanya" },
        ] as Prisma.InputJsonValue,
        keyInitiatives: [
          { name: "Self-serve onboarding", target: "Q1" },
          { name: "Pricing experiment", target: "Q1" },
        ] as Prisma.InputJsonValue,
        createdBy: u,
      },
    });
    opspDataCount++;
  }
  console.log(`✅ OPSP Documents/Sections: 1 / ${Object.keys(sectionContent).length}`);
  console.log(`✅ OPSP Data rows: ${opspDataCount}`);

  // OPSPPlan per user (personal rhythm)
  for (const m of members) {
    await db.oPSPPlan.upsert({
      where: { userId: m.userId },
      update: {},
      create: {
        orgId: org.id,
        userId: m.userId,
        relationships_long: "Build a network of 50 trusted peers in the industry.",
        relationships_1yr: "Reconnect with 12 former colleagues.",
        relationships_90d: "Schedule monthly 1-on-1s with manager.",
        achievements_long: "Lead a function at a $100M company.",
        achievements_1yr: "Ship two major initiatives end-to-end.",
        achievements_90d: "Complete current quarter rocks on time.",
        rituals_long: "Daily journaling, weekly retrospectives.",
        rituals_1yr: "Quarterly off-sites with team.",
        rituals_90d: "Friday week-in-review with manager.",
        wealth_long: "Achieve financial independence by age 50.",
        wealth_1yr: "Increase savings rate to 30%.",
        wealth_90d: "Set up automated investment plan.",
        tags: ["growth", "leadership"],
      },
    });
  }
  console.log(`✅ OPSP Personal Plans: ${members.length}`);

  // === Performance ===
  let reviewCount = 0;
  for (const reviewee of [...managers, ...employees]) {
    const reviewerId = reviewee.role === "manager" ? adminId : rand(managers).userId;
    const kpi = randInt(60, 95);
    const pri = randInt(60, 95);
    const att = randInt(80, 100);
    await db.performanceReview.create({
      data: {
        orgId: org.id,
        reviewerId,
        revieweeId: reviewee.userId,
        quarter: "Q1",
        year,
        kpiScore: kpi,
        priorityScore: pri,
        attendanceScore: att,
        overallScore: Math.round(((kpi + pri + att) / 3) * 10) / 10,
        rating: randInt(3, 5),
        strengths: rand(STRENGTHS),
        improvements: rand(IMPROVEMENTS),
        notes: "Solid quarter overall. Continue trajectory.",
        status: rand(["draft", "submitted", "acknowledged"]),
      },
    });
    reviewCount++;
  }
  console.log(`✅ Performance Reviews: ${reviewCount}`);

  let talentCount = 0;
  for (const u of [...managers, ...employees]) {
    const assessorId = u.role === "manager" ? adminId : rand(managers).userId;
    await db.talentAssessment.create({
      data: {
        orgId: org.id,
        userId: u.userId,
        assessorId,
        potential: rand(["low", "medium", "high"]),
        flightRisk: rand(["low", "low", "medium"]),
        successionReady: rand(["not-ready", "1-2-years", "ready-now"]),
        skills: rand([["leadership", "technical"], ["communication", "execution"], ["strategy", "ownership"]]),
        developmentNotes: "Pair with a senior on cross-functional initiatives next quarter.",
        quarter: "Q1",
        year,
      },
    });
    talentCount++;
  }
  console.log(`✅ Talent Assessments: ${talentCount}`);

  let goalCount = 0;
  for (const m of members) {
    const n = randInt(1, 3);
    for (let i = 0; i < n; i++) {
      const target = randInt(50, 200);
      const current = Math.floor(target * (0.2 + Math.random() * 0.7));
      await db.goal.create({
        data: {
          orgId: org.id,
          ownerId: m.userId,
          title: rand(GOAL_TITLES),
          description: "Aligned with the broader quarterly rocks.",
          category: rand(["growth", "operations", "team", "self"]),
          targetValue: target,
          currentValue: current,
          unit: "units",
          progressPercent: Math.round((current / target) * 100),
          quarter: "Q1",
          year,
          status: rand(["draft", "in-progress", "in-progress", "completed"]),
          createdBy: m.userId,
        },
      });
      goalCount++;
    }
  }
  console.log(`✅ Goals: ${goalCount}`);

  let oneOnOneCount = 0;
  for (const emp of employees) {
    const managerId = rand(managers).userId;
    for (let w = 0; w < 4; w++) {
      const sched = new Date(Date.now() - w * 7 * 86_400_000);
      await db.oneOnOne.create({
        data: {
          orgId: org.id,
          managerId,
          reportId: emp.userId,
          scheduledAt: sched,
          duration: 30,
          talkingPoints: "Quarter progress; blockers; career growth.",
          actionItems: "Manager to unblock vendor approval; report to draft 90-day plan.",
          notes: "Productive conversation, clear next steps.",
          mood: rand(["great", "good", "neutral"]),
          completedAt: w === 0 ? null : sched,
          createdBy: managerId,
        },
      });
      oneOnOneCount++;
    }
  }
  console.log(`✅ 1-on-1s: ${oneOnOneCount}`);

  let feedbackCount = 0;
  for (let i = 0; i < 20; i++) {
    const from = rand(members);
    const to = rand(members.filter((x) => x.userId !== from.userId));
    await db.feedbackEntry.create({
      data: {
        orgId: org.id,
        fromUserId: from.userId,
        toUserId: to.userId,
        category: rand(["recognition", "constructive", "general"]),
        visibility: rand(["private", "manager", "public"]),
        content: rand(FEEDBACK_BODIES),
      },
    });
    feedbackCount++;
  }
  console.log(`✅ Feedback Entries: ${feedbackCount}`);

  // === Surveys ===
  const survey1 = await db.survey.create({
    data: {
      orgId: org.id,
      type: "eNPS",
      title: "[Demo] Q1 Employee NPS",
      question: "How likely are you to recommend QuikScale as a place to work?",
      quarter: "Q1",
      year,
      status: "published",
      createdBy: adminId,
    },
  });
  const survey2 = await db.survey.create({
    data: {
      orgId: org.id,
      type: "pulse",
      title: "[Demo] Weekly Pulse — Energy Check",
      question: "How energized do you feel about this week's priorities?",
      quarter: "Q1",
      year,
      status: "published",
      createdBy: adminId,
    },
  });
  for (let i = 0; i < 15; i++) {
    await db.surveyResponse.create({
      data: {
        surveyId: survey1.id,
        score: randInt(6, 10),
        comment: i % 3 === 0 ? "Great culture, fast pace." : null,
        respondentName: i % 2 === 0 ? "Anonymous" : null,
      },
    });
    await db.surveyResponse.create({
      data: { surveyId: survey2.id, score: randInt(3, 5) },
    });
  }
  console.log(`✅ Surveys: 2  (30 responses)`);

  // === Habit Assessments ===
  for (let q = 0; q < 2; q++) {
    const yr = q === 0 ? year : year - 1;
    await db.habitAssessment.create({
      data: {
        orgId: org.id,
        assessmentDate: new Date(Date.now() - q * 90 * 86_400_000),
        quarter: "Q1",
        year: yr,
        habit1_vision: randInt(6, 10),
        habit2_meetings: randInt(6, 10),
        habit3_scoreboards: randInt(5, 9),
        habit4_accountable: randInt(6, 9),
        habit5_rhythm: randInt(7, 10),
        habit6_sticking: randInt(5, 9),
        habit7_cascading: randInt(5, 9),
        habit8_recognition: randInt(4, 8),
        habit9_training: randInt(5, 9),
        habit10_innovation: randInt(5, 9),
        averageScore: 7.3,
        maturityLevel: rand(["Forming", "Performing", "Optimizing"]),
        notes: rand(HABIT_NOTES),
        assessedBy: adminId,
      },
    });
  }
  console.log(`✅ Habit Assessments: 2`);

  // === SWT entries ===
  let swtCount = 0;
  for (const [type, list] of Object.entries(SWT_CONTENT)) {
    for (const [i, content] of list.entries()) {
      await db.sWTEntry.create({
        data: {
          orgId: org.id,
          quarter: "Q1",
          year,
          type,
          content,
          trendDirection: type === "trend" ? rand(["up", "flat", "down"]) : null,
          sortOrder: i,
          createdBy: adminId,
        },
      });
      swtCount++;
    }
  }
  console.log(`✅ SWT Entries: ${swtCount}`);

  // === KPI Notes + Logs (lightweight) ===
  // Only attach notes/logs to demo-user-owned KPIs so we don't pollute real Moreyeahs KPIs.
  const kpis = await db.kPI.findMany({
    where: { orgId: org.id, createdBy: { in: userIds } },
    select: { id: true, owner: true },
  });
  let kpiNoteCount = 0;
  for (const k of kpis.slice(0, 10)) {
    await db.kPINote.create({
      data: {
        orgId: org.id,
        kpiId: k.id,
        content: rand([
          "Customer escalation slowed this week — recovering next week.",
          "Pipeline strong, exceeded target by 12%.",
          "Blocker on integration partner — engaging leadership.",
        ]),
        authorId: k.owner ?? adminId,
      },
    });
    kpiNoteCount++;
    await db.kPILog.create({
      data: {
        orgId: org.id,
        kpiId: k.id,
        action: "UPDATE",
        oldValue: "0",
        newValue: String(randInt(10, 100)),
        changedBy: k.owner ?? adminId,
        reason: "Weekly update",
      },
    });
  }
  console.log(`✅ KPI Notes / Logs: ${kpiNoteCount} each`);

  console.log("\n🎉 Done seeding extras.");
}

main()
  .catch((e) => {
    console.error("\n❌ Seed extras failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
