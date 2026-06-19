/**
 * QuikTrack — dummy demo data seeder.
 *
 * Creates a self-contained "Demo QuikTrack" org with users, teams, two
 * projects, statuses, issue types, a sprint, issues, comments, history.
 *
 * Idempotent. Run:
 *   npx tsx --env-file=.env.local scripts/seed-dummy.ts
 *   (from apps/quiktrack)
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const ORG_SLUG = "demo-quiktrack";
const APP_SLUG = "quiktrack";
const PASSWORD = "Quikit2026";

const USERS = [
  { email: "qt.admin@quikit-demo.local", firstName: "Maya", lastName: "Roy", role: "admin" },
  { email: "qt.lead@quikit-demo.local", firstName: "Liam", lastName: "Foster", role: "manager" },
  { email: "qt.dev1@quikit-demo.local", firstName: "Sara", lastName: "Khan", role: "employee" },
  { email: "qt.dev2@quikit-demo.local", firstName: "Tom", lastName: "Patel", role: "employee" },
  { email: "qt.qa@quikit-demo.local", firstName: "Riya", lastName: "Mehta", role: "employee" },
  { email: "qt.pm@quikit-demo.local", firstName: "John", lastName: "Lee", role: "employee" },
];

const QT_TEAMS = [
  { name: "Backend Squad", color: "#2563eb" },
  { name: "Frontend Squad", color: "#10b981" },
  { name: "QA Squad", color: "#f59e0b" },
];

const PROJECTS = [
  { key: "WEB", name: "Web Platform", description: "Customer-facing web app", color: "#2563eb" },
  { key: "API", name: "Core API", description: "Backend services", color: "#10b981" },
];

const STATUSES = [
  { name: "Backlog", color: "#94a3b8", category: "BACKLOG", orderIndex: 0 },
  { name: "To Do", color: "#64748b", category: "TODO", orderIndex: 1 },
  { name: "In Progress", color: "#2563eb", category: "IN_PROGRESS", orderIndex: 2 },
  { name: "In Review", color: "#a855f7", category: "IN_PROGRESS", orderIndex: 3 },
  { name: "Done", color: "#10b981", category: "DONE", orderIndex: 4 },
];

const ISSUE_TYPES = [
  { name: "Story", color: "#10b981", icon: "bookmark" },
  { name: "Task", color: "#2563eb", icon: "check-square" },
  { name: "Bug", color: "#ef4444", icon: "bug" },
  { name: "Epic", color: "#a855f7", icon: "layers" },
];

const ISSUE_TITLES = [
  "Set up CI/CD pipeline",
  "Implement user authentication",
  "Build dashboard widgets",
  "Fix login redirect bug",
  "Add dark mode toggle",
  "Migrate to TypeScript 5",
  "Optimize SQL queries",
  "Write API documentation",
  "Refactor session handling",
  "Add export to CSV",
  "Improve error logging",
  "Set up monitoring alerts",
  "Build settings page",
  "Add 2FA support",
  "Update onboarding flow",
];

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function wipe(orgId: string, userIds: string[]) {
  console.log("🧨 Wiping existing demo data…");
  // QtIssue/QtIssueStatus/etc cascade from QtProject. QtProject cascades from Org.
  await db.$transaction([
    db.qtIssueLink.deleteMany({ where: { orgId } }),
    db.qtIssueComment.deleteMany({ where: { orgId } }),
    db.qtIssueHistory.deleteMany({ where: { orgId } }),
    db.qtTimesheetEntry.deleteMany({ where: { orgId } }),
    db.qtIssue.deleteMany({ where: { orgId } }),
    db.qtSprint.deleteMany({ where: { project: { orgId } } }),
    db.qtIssueStatus.deleteMany({ where: { project: { orgId } } }),
    db.qtIssueType.deleteMany({ where: { project: { orgId } } }),
    db.qtProjectMember.deleteMany({ where: { project: { orgId } } }),
    db.qtProjectTeam.deleteMany({ where: { project: { orgId } } }),
    db.qtPage.deleteMany({ where: { project: { orgId } } }),
    db.qtDoc.deleteMany({ where: { orgId } }),
    db.qtProject.deleteMany({ where: { orgId } }),
    db.qtTeamMember.deleteMany({ where: { team: { orgId } } }),
    db.qtTeam.deleteMany({ where: { orgId } }),
    db.userAppAccess.deleteMany({ where: { orgId } }),
    db.orgMember.deleteMany({ where: { orgId } }),
  ]);
  await db.user.deleteMany({
    where: { id: { in: userIds }, memberships: { none: {} } },
  });
}

async function ensureOrg() {
  return db.org.upsert({
    where: { slug: ORG_SLUG },
    update: {},
    create: {
      name: "Demo QuikTrack",
      slug: ORG_SLUG,
      description: "Auto-seeded demo org for QuikTrack",
      plan: "growth",
      brandColor: "#2563eb",
    },
  });
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
      },
    });
    ids[u.email] = user.id;
  }
  for (const u of USERS) {
    await db.orgMember.upsert({
      where: { orgId_userId: { orgId, userId: ids[u.email]! } },
      update: { role: u.role, status: "active" },
      create: { orgId, userId: ids[u.email]!, role: u.role, status: "active", acceptedAt: new Date() },
    });
    await db.userAppAccess.upsert({
      where: { userId_orgId_appId: { userId: ids[u.email]!, orgId, appId } },
      update: { role: u.role === "admin" ? "admin" : "member" },
      create: { userId: ids[u.email]!, orgId, appId, role: u.role === "admin" ? "admin" : "member" },
    });
  }
  return ids;
}

async function seedTeams(orgId: string, userIds: Record<string, string>) {
  const teamIds: string[] = [];
  const userEmails = Object.keys(userIds);
  for (const [i, t] of QT_TEAMS.entries()) {
    const team = await db.qtTeam.create({
      data: { orgId, name: t.name, color: t.color, leadUserId: userIds[USERS[1]!.email] },
    });
    teamIds.push(team.id);
    // Add 2-3 members per team
    const members = userEmails.slice(i * 2, i * 2 + 3);
    for (const email of members) {
      await db.qtTeamMember.create({ data: { teamId: team.id, userId: userIds[email]!, role: "MEMBER" } });
    }
  }
  return teamIds;
}

async function seedProject(orgId: string, p: { key: string; name: string; description: string; color: string }, userIds: Record<string, string>, qtTeamIds: string[]) {
  const lead = userIds[USERS[1]!.email]!;
  const project = await db.qtProject.create({
    data: {
      orgId,
      projectKey: p.key,
      name: p.name,
      description: p.description,
      projectType: "software",
      color: p.color,
      status: "active",
      leadUserId: lead,
      startDate: new Date(),
      createdBy: userIds[USERS[0]!.email],
    },
  });

  // Members
  for (const u of USERS) {
    await db.qtProjectMember.create({
      data: { projectId: project.id, userId: userIds[u.email]!, role: u.role === "admin" ? "ADMIN" : "MEMBER" },
    });
  }
  // Attach all qt teams
  for (const tid of qtTeamIds) {
    await db.qtProjectTeam.create({ data: { projectId: project.id, teamId: tid } });
  }

  // Statuses
  const statusIds: Record<string, string> = {};
  for (const s of STATUSES) {
    const row = await db.qtIssueStatus.create({
      data: { projectId: project.id, name: s.name, color: s.color, category: s.category, orderIndex: s.orderIndex },
    });
    statusIds[s.name] = row.id;
  }

  // Issue types
  for (const t of ISSUE_TYPES) {
    await db.qtIssueType.create({
      data: { projectId: project.id, name: t.name, color: t.color, icon: t.icon, orderIndex: ISSUE_TYPES.indexOf(t) },
    });
  }

  // Sprint
  const sprint = await db.qtSprint.create({
    data: {
      projectId: project.id,
      name: `${p.key} Sprint 1`,
      goal: `Initial sprint for ${p.name}`,
      status: "ACTIVE",
      startDate: new Date(),
      endDate: new Date(Date.now() + 14 * 24 * 3600 * 1000),
      startedAt: new Date(),
      createdBy: lead,
    },
  });

  // Issues
  const userIdList = Object.values(userIds);
  let issueCounter = 0;
  const epicTitles = ["Customer Onboarding", "Payment & Billing", "Reporting & Analytics"];
  const epicIds: string[] = [];
  for (const title of epicTitles) {
    issueCounter++;
    const epic = await db.qtIssue.create({
      data: {
        orgId,
        projectId: project.id,
        key: `${p.key}-${issueCounter}`,
        title,
        description: `${title} epic for ${p.name}`,
        type: "EPIC",
        statusId: statusIds["In Progress"]!,
        priority: "HIGH",
        assigneeId: userIds[USERS[1]!.email],
        reporterId: userIds[USERS[0]!.email],
        sprintId: sprint.id,
        startDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        storyPoints: 21,
        createdBy: userIds[USERS[0]!.email],
      },
    });
    epicIds.push(epic.id);
  }

  for (const title of ISSUE_TITLES) {
    issueCounter++;
    const statusName = rand(STATUSES).name;
    const type = rand(["TASK", "STORY", "BUG"]);
    const assignee = rand(userIdList);
    const epic = rand(epicIds);
    const issue = await db.qtIssue.create({
      data: {
        orgId,
        projectId: project.id,
        key: `${p.key}-${issueCounter}`,
        title,
        description: `Description for: ${title}`,
        type,
        statusId: statusIds[statusName]!,
        priority: rand(PRIORITIES),
        assigneeId: assignee,
        reporterId: userIds[USERS[1]!.email],
        sprintId: sprint.id,
        epicId: epic,
        startDate: new Date(),
        dueDate: new Date(Date.now() + randInt(3, 21) * 24 * 3600 * 1000),
        storyPoints: rand([1, 2, 3, 5, 8]),
        createdBy: userIds[USERS[1]!.email],
      },
    });

    // Comments
    const commentCount = randInt(0, 3);
    for (let i = 0; i < commentCount; i++) {
      const author = rand(userIdList);
      await db.qtIssueComment.create({
        data: {
          orgId,
          projectId: project.id,
          issueId: issue.id,
          userId: author,
          body: rand([
            "Looks good, ready to merge.",
            "Can you add a unit test?",
            "Hit a blocker — see Slack thread.",
            "PR is up for review.",
            "Re-tested, all good.",
          ]),
        },
      });
    }
    // History
    await db.qtIssueHistory.create({
      data: { orgId, projectId: project.id, issueId: issue.id, userId: assignee, field: "status", oldValue: "Backlog", newValue: statusName },
    });

    // Timesheet
    if (Math.random() > 0.5) {
      await db.qtTimesheetEntry.create({
        data: {
          orgId,
          userId: assignee,
          projectId: project.id,
          issueId: issue.id,
          entryDate: new Date(),
          hours: rand([0.5, 1, 2, 3, 4]),
          description: `Worked on ${title}`,
          createdBy: assignee,
        },
      });
    }
  }

  // Page + Doc
  await db.qtPage.create({
    data: {
      projectId: project.id,
      title: `${p.name} Wiki Home`,
      content: `# ${p.name}\n\nWelcome to the ${p.name} wiki.`,
      authorId: userIds[USERS[1]!.email]!,
      createdBy: userIds[USERS[1]!.email],
    },
  });
  await db.qtDoc.create({
    data: {
      orgId,
      projectId: project.id,
      title: `${p.name} Architecture Overview`,
      content: `Architecture overview for ${p.name}.`,
      createdBy: userIds[USERS[1]!.email],
    },
  });

  return issueCounter;
}

async function main() {
  console.log("🌱 Seeding QuikTrack demo data…\n");
  const app = await db.app.findUnique({ where: { slug: APP_SLUG } });
  if (!app) throw new Error(`App slug "${APP_SLUG}" not found — seed apps first`);

  const org = await ensureOrg();
  const knownIds: string[] = [];
  for (const u of USERS) {
    const existing = await db.user.findUnique({ where: { email: u.email }, select: { id: true } });
    if (existing) knownIds.push(existing.id);
  }
  await wipe(org.id, knownIds);

  const userIds = await ensureUsers(org.id, app.id);
  console.log(`✅ Org: ${org.name} (${org.id})`);
  console.log(`✅ Users: ${USERS.length}`);

  const qtTeamIds = await seedTeams(org.id, userIds);
  console.log(`✅ QtTeams: ${QT_TEAMS.length}`);

  let totalIssues = 0;
  for (const p of PROJECTS) {
    const n = await seedProject(org.id, p, userIds, qtTeamIds);
    totalIssues += n;
    console.log(`✅ Project ${p.key} (${p.name}): ${n} issues`);
  }

  console.log(`\n🎉 Done. ${PROJECTS.length} projects, ${totalIssues} issues. Login with:`);
  for (const u of USERS) console.log(`   ${u.email}  /  ${PASSWORD}    (${u.role})`);
}

main()
  .catch((e) => {
    console.error("\n❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
