/**
 * QuikScale — dummy demo data seeder.
 *
 * Creates a self-contained "Demo QuikScale" org with users, teams, KPIs,
 * priorities, WWW items, categories and quarter settings — enough to click
 * through every page in the app.
 *
 * Idempotent: re-running wipes only data scoped to the demo org's id and
 * the demo users' emails (no other tenants are touched).
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/seed-dummy.ts
 *   (from apps/quikscale)
 */

import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const ORG_SLUG = "moreyeahs";
const APP_SLUG = "quikscale";
const PASSWORD = "Quikit2026";

const TEAMS = [
  { slug: "demo-engineering", name: "Demo Engineering", color: "#3b82f6" },
  { slug: "demo-sales", name: "Demo Sales", color: "#10b981" },
  { slug: "demo-marketing", name: "Demo Marketing", color: "#f59e0b" },
];

const TEAM_KEYS = { engineering: "demo-engineering", sales: "demo-sales", marketing: "demo-marketing" } as const;

const USERS = [
  { email: "qs.admin@example.com", firstName: "Aanya", lastName: "Sharma", role: "admin", team: TEAM_KEYS.engineering },
  { email: "qs.alice@example.com", firstName: "Alice", lastName: "Johnson", role: "manager", team: TEAM_KEYS.engineering },
  { email: "qs.bob@example.com", firstName: "Bob", lastName: "Smith", role: "manager", team: TEAM_KEYS.sales },
  { email: "qs.carol@example.com", firstName: "Carol", lastName: "Williams", role: "employee", team: TEAM_KEYS.engineering },
  { email: "qs.david@example.com", firstName: "David", lastName: "Brown", role: "employee", team: TEAM_KEYS.sales },
  { email: "qs.eva@example.com", firstName: "Eva", lastName: "Garcia", role: "employee", team: TEAM_KEYS.marketing },
  { email: "qs.frank@example.com", firstName: "Frank", lastName: "Davis", role: "employee", team: TEAM_KEYS.marketing },
  { email: "qs.grace@example.com", firstName: "Grace", lastName: "Miller", role: "employee", team: TEAM_KEYS.engineering },
];

const DEMO_EMAILS = USERS.map((u) => u.email);

const CATEGORIES = [
  { name: "Demo Revenue", dataType: "Currency", currency: "INR" },
  { name: "Demo Operations", dataType: "Number", currency: null },
  { name: "Demo People", dataType: "Number", currency: null },
  { name: "Demo Customer", dataType: "Percentage", currency: null },
];

const KPI_POOL = [
  { name: "Monthly Revenue", unit: "Currency", target: 1500000, scale: "L" },
  { name: "Tickets Resolved", unit: "Number", target: 50, scale: null },
  { name: "Customer NPS", unit: "Percentage", target: 80, scale: null },
  { name: "PR Reviews Completed", unit: "Number", target: 40, scale: null },
  { name: "Sales Calls Made", unit: "Number", target: 60, scale: null },
  { name: "Demo Conversions", unit: "Percentage", target: 35, scale: null },
  { name: "Bug Fixes Shipped", unit: "Number", target: 25, scale: null },
  { name: "Marketing Qualified Leads", unit: "Number", target: 200, scale: null },
];

const TEAM_KPIS = [
  { name: "Quarterly Revenue", unit: "Currency", target: 12000000, scale: "L", team: TEAM_KEYS.sales },
  { name: "Team Velocity (Story Points)", unit: "Number", target: 600, scale: null, team: TEAM_KEYS.engineering },
  { name: "Customer Retention Rate", unit: "Percentage", target: 95, scale: null, team: TEAM_KEYS.sales },
];

const PRIORITY_TEMPLATES = [
  "Launch v2 of customer portal",
  "Migrate legacy CRM to new stack",
  "Hire 2 senior engineers",
  "Run Q1 OKR planning workshop",
  "Close 5 enterprise deals",
  "Set up CI/CD for mobile apps",
];

const WWW_TEMPLATES = [
  "Closed first enterprise deal",
  "Shipped dark mode support",
  "Reduced bug backlog by 40%",
  "Onboarded new team member",
  "Migrated DB to new cluster",
  "Hit weekly KPI target",
  "Resolved long-standing tech debt",
  "Improved deployment time by 50%",
];

const PRIORITY_STATUSES = ["not-started", "on-track", "behind-schedule", "completed"];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pickN<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

async function wipe(orgId: string, userIds: string[]) {
  // Scope all deletes strictly to the demo users / demo team names / demo category names
  // so real Moreyeahs data is never touched.
  console.log("🧨 Wiping existing demo data (scoped to demo users + demo entities only)…");
  const demoTeamSlugs = TEAMS.map((t) => t.slug);
  const demoCategoryNames = CATEGORIES.map((c) => c.name);
  const demoTeams = await db.team.findMany({ where: { orgId, slug: { in: demoTeamSlugs } }, select: { id: true } });
  const demoTeamIds = demoTeams.map((t) => t.id);

  await db.$transaction([
    db.kPIWeeklyValue.deleteMany({ where: { orgId, kpi: { createdBy: { in: userIds } } } }),
    db.kPINote.deleteMany({ where: { orgId, authorId: { in: userIds } } }),
    db.kPILog.deleteMany({ where: { orgId, changedBy: { in: userIds } } }),
    db.kPI.deleteMany({ where: { orgId, createdBy: { in: userIds } } }),
    db.priorityWeeklyStatus.deleteMany({ where: { priority: { orgId, createdBy: { in: userIds } } } }),
    db.priority.deleteMany({ where: { orgId, createdBy: { in: userIds } } }),
    db.wWWRevisionLog.deleteMany({ where: { wwwItem: { orgId, createdBy: { in: userIds } } } }),
    db.wWWItem.deleteMany({ where: { orgId, createdBy: { in: userIds } } }),
    db.accountabilityFunction.deleteMany({ where: { orgId, teamId: { in: demoTeamIds } } }),
    db.categoryMaster.deleteMany({ where: { orgId, name: { in: demoCategoryNames } } }),
    db.userTeam.deleteMany({ where: { orgId, userId: { in: userIds } } }),
    db.team.deleteMany({ where: { orgId, slug: { in: demoTeamSlugs } } }),
    db.userAppAccess.deleteMany({ where: { orgId, userId: { in: userIds } } }),
    db.orgMember.deleteMany({ where: { orgId, userId: { in: userIds } } }),
  ]);
  // Users that only belong to the demo org can be safely removed.
  await db.user.deleteMany({
    where: {
      id: { in: userIds },
      memberships: { none: {} },
    },
  });
}

async function ensureOrg() {
  const org = await db.org.findUnique({ where: { slug: ORG_SLUG } });
  if (!org) throw new Error(`Org "${ORG_SLUG}" not found — refusing to create. Aborting.`);
  return org;
}

async function ensureUsers(orgId: string, appId: string) {
  const hashed = await bcrypt.hash(PASSWORD, 10);
  const ids: Record<string, string> = {};

  for (const u of USERS) {
    const user = await db.user.upsert({
      where: { email: u.email },
      update: { firstName: u.firstName, lastName: u.lastName, password: hashed },
      create: {
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        password: hashed,
        emailVerified: new Date(),
        themeMode: "light",
        accentColor: "#0066cc",
      },
    });
    ids[u.email] = user.id;
  }

  for (const u of USERS) {
    await db.orgMember.upsert({
      where: { orgId_userId: { orgId, userId: ids[u.email]! } },
      update: { role: u.role, status: "active" },
      create: {
        orgId,
        userId: ids[u.email]!,
        role: u.role,
        status: "active",
        acceptedAt: new Date(),
      },
    });
    await db.userAppAccess.upsert({
      where: { userId_orgId_appId: { userId: ids[u.email]!, orgId, appId } },
      update: { role: u.role === "admin" ? "admin" : "member" },
      create: {
        userId: ids[u.email]!,
        orgId,
        appId,
        role: u.role === "admin" ? "admin" : "member",
      },
    });
  }
  return ids;
}

async function seedTeams(orgId: string, userIds: Record<string, string>) {
  const teamIds: Record<string, string> = {};
  for (const [i, t] of TEAMS.entries()) {
    const headEmail = USERS.find((u) => u.team === t.slug && u.role !== "employee")?.email
      ?? USERS.find((u) => u.team === t.slug)?.email;
    const team = await db.team.create({
      data: {
        orgId,
        name: t.name,
        slug: t.slug,
        color: t.color,
        headId: headEmail ? userIds[headEmail] : null,
        createdBy: userIds[USERS[0]!.email],
      },
    });
    teamIds[t.slug] = team.id;
  }
  // OrgMember.teamId — assign each user's primary team
  for (const u of USERS) {
    await db.orgMember.update({
      where: { orgId_userId: { orgId, userId: userIds[u.email]! } },
      data: { teamId: teamIds[u.team] },
    });
    await db.userTeam.create({
      data: { orgId, userId: userIds[u.email]!, teamId: teamIds[u.team]! },
    });
  }
  return teamIds;
}

async function seedQuarters(orgId: string, createdBy: string) {
  const year = new Date().getFullYear();
  const quarters = [
    { quarter: "Q1", startDate: new Date(`${year}-04-01`), endDate: new Date(`${year}-06-30`) },
    { quarter: "Q2", startDate: new Date(`${year}-07-01`), endDate: new Date(`${year}-09-30`) },
    { quarter: "Q3", startDate: new Date(`${year}-10-01`), endDate: new Date(`${year}-12-31`) },
    { quarter: "Q4", startDate: new Date(`${year + 1}-01-01`), endDate: new Date(`${year + 1}-03-31`) },
  ];
  const now = new Date();
  for (const q of quarters) {
    const status = q.endDate < now ? "completed" : q.startDate > now ? "upcoming" : "active";
    // Skip if Moreyeahs already has this quarter (don't overwrite real data).
    await db.quarterSetting.upsert({
      where: { orgId_fiscalYear_quarter: { orgId, fiscalYear: year, quarter: q.quarter } },
      update: {},
      create: { orgId, fiscalYear: year, quarter: q.quarter, startDate: q.startDate, endDate: q.endDate, status, createdBy },
    });
  }
  return year;
}

async function seedCategories(orgId: string, createdBy: string) {
  for (const c of CATEGORIES) {
    const existing = await db.categoryMaster.findFirst({ where: { orgId, name: c.name } });
    if (existing) continue;
    await db.categoryMaster.create({
      data: {
        orgId,
        name: c.name,
        nameKey: c.name.toLowerCase().trim(),
        dataType: c.dataType,
        currency: c.currency,
        createdBy,
      },
    });
  }
}

async function seedKPIs(orgId: string, year: number, userIds: Record<string, string>, teamIds: Record<string, string>) {
  let total = 0;
  // Individual KPIs
  for (const u of USERS) {
    const count = randInt(1, 3);
    const picks = pickN(KPI_POOL, count);
    for (const tmpl of picks) {
      const target = tmpl.target;
      const weeklyTargets: Record<string, number> = {};
      for (let w = 1; w <= 13; w++) weeklyTargets[String(w)] = target / 13;
      const kpi = await db.kPI.create({
        data: {
          orgId,
          name: `${tmpl.name} (${u.firstName})`,
          description: `Demo KPI for ${u.firstName}`,
          kpiLevel: "individual",
          owner: userIds[u.email],
          quarter: "Q1",
          year,
          measurementUnit: tmpl.unit,
          target,
          quarterlyGoal: target,
          qtdGoal: target,
          divisionType: "Cumulative",
          weeklyTargets: weeklyTargets as Prisma.InputJsonValue,
          targetScale: tmpl.scale,
          frequency: "weekly",
          status: "active",
          healthStatus: rand(["on-track", "on-track", "at-risk"]),
          teamId: teamIds[u.team],
          createdBy: userIds[u.email]!,
        },
      });
      const weeksWith = randInt(3, 8);
      let qtd = 0;
      for (let w = 1; w <= weeksWith; w++) {
        const expected = target / 13;
        const actual = expected * (0.6 + Math.random() * 0.6);
        await db.kPIWeeklyValue.create({
          data: {
            orgId,
            kpiId: kpi.id,
            userId: userIds[u.email],
            weekNumber: w,
            value: Math.round(actual * 100) / 100,
            createdBy: userIds[u.email]!,
          },
        });
        qtd += actual;
      }
      await db.kPI.update({ where: { id: kpi.id }, data: { qtdAchieved: Math.round(qtd * 100) / 100 } });
      total++;
    }
  }
  // Team KPIs
  for (const t of TEAM_KPIS) {
    const teamMembers = USERS.filter((u) => u.team === t.team);
    const ownerIds = teamMembers.map((u) => userIds[u.email]!);
    const contribPerOwner = 100 / ownerIds.length;
    const ownerContributions: Record<string, number> = {};
    ownerIds.forEach((id) => (ownerContributions[id] = contribPerOwner));
    const weeklyTargets: Record<string, number> = {};
    for (let w = 1; w <= 13; w++) weeklyTargets[String(w)] = t.target / 13;
    const kpi = await db.kPI.create({
      data: {
        orgId,
        name: t.name,
        description: `Team-wide ${t.name}`,
        kpiLevel: "team",
        owner: ownerIds[0]!,
        ownerIds,
        ownerContributions: ownerContributions as Prisma.InputJsonValue,
        teamId: teamIds[t.team],
        quarter: "Q1",
        year,
        measurementUnit: t.unit,
        target: t.target,
        quarterlyGoal: t.target,
        qtdGoal: t.target,
        divisionType: "Cumulative",
        weeklyTargets: weeklyTargets as Prisma.InputJsonValue,
        targetScale: t.scale,
        frequency: "weekly",
        status: "active",
        healthStatus: "on-track",
        createdBy: ownerIds[0]!,
      },
    });
    for (const ownerId of ownerIds) {
      for (let w = 1; w <= 6; w++) {
        const per = (t.target / ownerIds.length) / 13;
        await db.kPIWeeklyValue.create({
          data: {
            orgId,
            kpiId: kpi.id,
            userId: ownerId,
            weekNumber: w,
            value: Math.round(per * (0.7 + Math.random() * 0.6) * 100) / 100,
            createdBy: ownerId,
          },
        });
      }
    }
    total++;
  }
  return total;
}

async function seedPriorities(orgId: string, year: number, userIds: Record<string, string>, teamIds: Record<string, string>) {
  let count = 0;
  for (const u of USERS) {
    const n = randInt(0, 2);
    for (let i = 0; i < n; i++) {
      const priority = await db.priority.create({
        data: {
          orgId,
          name: `${rand(PRIORITY_TEMPLATES)} (${u.firstName})`,
          owner: userIds[u.email]!,
          teamId: teamIds[u.team],
          quarter: "Q1",
          year,
          startWeek: 1,
          endWeek: 13,
          overallStatus: rand(PRIORITY_STATUSES),
          createdBy: userIds[u.email]!,
        },
      });
      for (let w = 1; w <= 13; w++) {
        await db.priorityWeeklyStatus.create({
          data: {
            priorityId: priority.id,
            weekNumber: w,
            status: w <= 4 ? rand(PRIORITY_STATUSES) : "not-started",
          },
        });
      }
      count++;
    }
  }
  return count;
}

async function seedWWW(orgId: string, userIds: Record<string, string>) {
  let count = 0;
  for (const u of USERS) {
    const n = randInt(2, 5);
    const picks = pickN(WWW_TEMPLATES, Math.min(n, WWW_TEMPLATES.length));
    for (const what of picks) {
      const daysFromNow = randInt(-7, 14);
      await db.wWWItem.create({
        data: {
          orgId,
          who: userIds[u.email]!,
          what,
          when: new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000),
          status: rand(["not-started", "in-progress", "completed"]),
          createdBy: userIds[u.email]!,
        },
      });
      count++;
    }
  }
  return count;
}

async function seedAccountabilityFunctions(orgId: string, userIds: Record<string, string>, teamIds: Record<string, string>) {
  const eng = await db.accountabilityFunction.create({
    data: {
      orgId,
      name: "Demo Engineering Excellence",
      description: "Ship reliable software",
      teamId: teamIds[TEAM_KEYS.engineering],
      assignedToUserId: userIds["qs.alice@example.com"],
    },
  });
  await db.accountabilityFunction.createMany({
    data: [
      { orgId, name: "Demo Code Review Ownership", teamId: teamIds[TEAM_KEYS.engineering], parentFunctionId: eng.id, assignedToUserId: userIds["qs.carol@example.com"] },
      { orgId, name: "Demo Production Reliability", teamId: teamIds[TEAM_KEYS.engineering], parentFunctionId: eng.id, assignedToUserId: userIds["qs.grace@example.com"] },
      { orgId, name: "Demo Sales Pipeline Growth", teamId: teamIds[TEAM_KEYS.sales], assignedToUserId: userIds["qs.bob@example.com"] },
      { orgId, name: "Demo Brand & Marketing", teamId: teamIds[TEAM_KEYS.marketing], assignedToUserId: userIds["qs.eva@example.com"] },
    ],
  });
}

async function main() {
  console.log("🌱 Seeding QuikScale demo data…\n");
  const app = await db.app.findUnique({ where: { slug: APP_SLUG } });
  if (!app) throw new Error(`App slug "${APP_SLUG}" not found — seed apps first`);

  const org = await ensureOrg();
  const userIds: Record<string, string> = {};
  for (const u of USERS) {
    const existing = await db.user.findUnique({ where: { email: u.email }, select: { id: true } });
    if (existing) userIds[u.email] = existing.id;
  }
  const knownUserIds = Object.values(userIds);
  await wipe(org.id, knownUserIds);

  const finalUserIds = await ensureUsers(org.id, app.id);
  console.log(`✅ Org: ${org.name} (${org.id})`);
  console.log(`✅ Users: ${USERS.length}`);

  const teamIds = await seedTeams(org.id, finalUserIds);
  console.log(`✅ Teams: ${TEAMS.length}`);

  const adminId = finalUserIds[USERS[0]!.email]!;
  const year = await seedQuarters(org.id, adminId);
  console.log(`✅ Quarters: 4 (FY${year})`);

  await seedCategories(org.id, adminId);
  console.log(`✅ Categories: ${CATEGORIES.length}`);

  await seedAccountabilityFunctions(org.id, finalUserIds, teamIds);
  console.log("✅ Accountability functions: 5");

  const kpis = await seedKPIs(org.id, year, finalUserIds, teamIds);
  console.log(`✅ KPIs: ${kpis} (with weekly values)`);

  const priorities = await seedPriorities(org.id, year, finalUserIds, teamIds);
  console.log(`✅ Priorities: ${priorities} (with weekly statuses)`);

  const www = await seedWWW(org.id, finalUserIds);
  console.log(`✅ WWW items: ${www}`);

  console.log("\n🎉 Done. Login with:");
  for (const u of USERS) console.log(`   ${u.email}  /  ${PASSWORD}    (${u.role})`);
}

main()
  .catch((e) => {
    console.error("\n❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
