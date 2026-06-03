/**
 * Adds extra board stages (statuses) to the "Chat application" project and
 * seeds issues into the new columns. Reorders all statuses into a sensible
 * left-to-right workflow.
 *
 * Run from apps/quiktrack:
 *   npx tsx scripts/seed-chat-app-stages.ts        (DATABASE_URL must be set)
 *
 * Optional first arg: project id / key / name (defaults to the Chat app).
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const PROJECT_HINT = process.argv[2] ?? "cmp2fuzhv0007l1c00jk27oo8";

// Desired full board order. Existing statuses are matched by name and
// reordered; missing ones are created. category drives board grouping +
// default behaviour (BACKLOG / IN_PROGRESS / DONE; TODO is treated like the
// first column).
const DESIRED_ORDER: Array<{ name: string; category: string; color: string }> = [
  { name: "To Do", category: "BACKLOG", color: "#94a3b8" },
  { name: "In Progress", category: "IN_PROGRESS", color: "#2563eb" },
  { name: "Blocked", category: "IN_PROGRESS", color: "#dc2626" },
  { name: "Ready for QA", category: "IN_PROGRESS", color: "#f59e0b" },
  { name: "In Review", category: "IN_PROGRESS", color: "#9333ea" },
  { name: "Done", category: "DONE", color: "#16a34a" },
  { name: "Deployed", category: "DONE", color: "#0d9488" },
];

// New issues to drop into the freshly-added columns: [title, type, statusName, sp]
const NEW_ISSUES: Array<[string, "STORY" | "TASK" | "BUG", string, number]> = [
  ["E2E encryption blocked on key-exchange library", "STORY", "Blocked", 13],
  ["Push notifications blocked on FCM credentials", "TASK", "Blocked", 5],
  ["Message search ready for QA sign-off", "STORY", "Ready for QA", 8],
  ["Image upload + inline preview ready for QA", "STORY", "Ready for QA", 5],
  ["Emoji picker overflow fix ready for QA", "BUG", "Ready for QA", 1],
  ["WebSocket lifecycle deployed to staging", "STORY", "Deployed", 8],
  ["Message persistence deployed to staging", "TASK", "Deployed", 5],
];

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
function rand<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  const project =
    (await db.qtProject.findFirst({ where: { id: PROJECT_HINT, isDeleted: false }, select: { id: true, orgId: true, projectKey: true, name: true } })) ??
    (await db.qtProject.findFirst({ where: { projectKey: PROJECT_HINT, isDeleted: false }, select: { id: true, orgId: true, projectKey: true, name: true } })) ??
    (await db.qtProject.findFirst({ where: { name: { contains: "Chat", mode: "insensitive" }, isDeleted: false }, select: { id: true, orgId: true, projectKey: true, name: true } }));
  if (!project) throw new Error(`No project found for "${PROJECT_HINT}".`);
  const { id: projectId, orgId, projectKey } = project;
  console.log(`Project: ${project.name} (${projectKey}, ${projectId})`);

  const existing = await db.qtIssueStatus.findMany({
    where: { projectId, isDeleted: false },
    select: { id: true, name: true },
  });
  const byName = new Map(existing.map((s) => [s.name.toLowerCase(), s]));

  // Create-or-update each status with its target orderIndex.
  const statusIdByName = new Map<string, string>();
  for (let i = 0; i < DESIRED_ORDER.length; i++) {
    const def = DESIRED_ORDER[i]!;
    const found = byName.get(def.name.toLowerCase());
    if (found) {
      await db.qtIssueStatus.update({ where: { id: found.id }, data: { orderIndex: i, category: def.category, color: def.color } });
      statusIdByName.set(def.name, found.id);
    } else {
      const row = await db.qtIssueStatus.create({
        data: { projectId, name: def.name, color: def.color, category: def.category, orderIndex: i },
        select: { id: true },
      });
      statusIdByName.set(def.name, row.id);
      console.log(`  + Added stage: ${def.name}`);
    }
  }

  // Members + active sprint for the new issues.
  const members = await db.qtProjectMember.findMany({ where: { projectId, isDeleted: false }, select: { userId: true } });
  let userIds = members.map((m) => m.userId);
  if (userIds.length === 0) {
    const om = await db.orgMember.findFirst({ where: { orgId, status: "active" }, select: { userId: true } });
    if (!om) throw new Error("No members to assign issues to.");
    userIds = [om.userId];
  }
  const reporter = userIds[0]!;
  const sprint = await db.qtSprint.findFirst({ where: { projectId, status: "ACTIVE", isDeleted: false }, select: { id: true } });

  let seq = await db.qtIssue.count({ where: { projectId } });
  let created = 0;
  for (const [title, type, statusName, sp] of NEW_ISSUES) {
    const statusId = statusIdByName.get(statusName);
    if (!statusId) continue;
    seq += 1;
    await db.qtIssue.create({
      data: {
        orgId,
        projectId,
        key: `${projectKey}-${seq}`,
        title,
        description: `Description for: ${title}`,
        type,
        statusId,
        priority: type === "BUG" ? rand(["HIGH", "URGENT"]) : rand(PRIORITIES),
        assigneeId: rand(userIds),
        reporterId: reporter,
        sprintId: sprint?.id ?? null,
        startDate: new Date(),
        dueDate: new Date(Date.now() + randInt(2, 14) * 24 * 3600 * 1000),
        storyPoints: sp,
        createdBy: reporter,
        updatedBy: reporter,
      },
    });
    created += 1;
  }

  console.log(`  Reordered ${DESIRED_ORDER.length} stages, created ${created} issues in the new columns.`);
  console.log("Done. Refresh the Board.");
}

main()
  .catch((e) => { console.error("Failed:", e); process.exit(1); })
  .finally(() => db.$disconnect());
