/**
 * Seeds realistic dummy data into ONE existing QuikTrack project (the
 * "Chat application" space) so the Board / Backlog / List views have content.
 *
 * Looks the project up by id (from the URL) and falls back to name match.
 * Creates an ACTIVE sprint (the Board only shows active-sprint issues),
 * a handful of epics, ~22 chat-app-themed issues spread across every status,
 * and a few comments. Uses existing project members for assignee/reporter.
 *
 * Run from apps/quiktrack:
 *   npx tsx --env-file=.env.local scripts/seed-chat-app.ts
 *
 * Optional: pass a project id or key as the first arg to target a different
 * space:  npx tsx --env-file=.env.local scripts/seed-chat-app.ts CMP
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const PROJECT_HINT = process.argv[2] ?? "cmp2fuzhv0007l1c00jk27oo8";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

const EPICS = [
  "Real-time messaging core",
  "Presence & typing indicators",
  "Group chat & channels",
  "Notifications & unread state",
  "Media & file sharing",
];

// [title, type, preferred status category, storyPoints]
// category drives which board column it lands in.
const ISSUES: Array<[string, "STORY" | "TASK" | "BUG", "TODO" | "IN_PROGRESS" | "DONE", number]> = [
  ["Establish WebSocket connection lifecycle", "STORY", "DONE", 8],
  ["Reconnect with exponential backoff on socket drop", "TASK", "DONE", 5],
  ["Persist messages to the database", "STORY", "DONE", 5],
  ["Render message list with virtualized scroll", "STORY", "IN_PROGRESS", 8],
  ["Show delivery + read receipts", "STORY", "IN_PROGRESS", 5],
  ["Typing indicator ('X is typing…')", "TASK", "IN_PROGRESS", 3],
  ["Online / offline presence dots", "STORY", "IN_PROGRESS", 3],
  ["Emoji reactions on messages", "STORY", "TODO", 3],
  ["Reply / thread to a message", "STORY", "TODO", 8],
  ["Edit and delete sent messages", "TASK", "TODO", 5],
  ["Unread badge per conversation", "TASK", "TODO", 3],
  ["Create group channels with members", "STORY", "TODO", 8],
  ["@mention autocomplete in composer", "STORY", "TODO", 5],
  ["Image upload + inline preview", "STORY", "TODO", 5],
  ["File attachment (PDF, docs) with size cap", "TASK", "TODO", 3],
  ["Push notifications for new messages", "STORY", "TODO", 8],
  ["Full-text message search", "STORY", "TODO", 8],
  ["End-to-end encryption for DMs", "STORY", "TODO", 13],
  ["Messages duplicate on flaky reconnect", "BUG", "IN_PROGRESS", 3],
  ["Typing indicator stuck after tab close", "BUG", "TODO", 2],
  ["Unread count off-by-one on mobile", "BUG", "TODO", 2],
  ["Emoji picker overflows on small screens", "BUG", "TODO", 1],
];

const COMMENTS = [
  "PR is up for review — added integration tests for the socket layer.",
  "Repro: open two tabs, kill wifi, reconnect. Logged in #chat-bugs.",
  "Design signed off by the product team, moving to build.",
  "Blocked on the notifications service env vars — pinged Suyash.",
  "Re-tested on staging, looks good. Ready to merge.",
  "Split this into a follow-up — scope was getting too big for one sprint.",
];

function rand<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  // 1. Resolve the project (by id, then by key, then by name).
  const project =
    (await db.qtProject.findFirst({
      where: { id: PROJECT_HINT, isDeleted: false },
      select: { id: true, orgId: true, projectKey: true, name: true },
    })) ??
    (await db.qtProject.findFirst({
      where: { projectKey: PROJECT_HINT, isDeleted: false },
      select: { id: true, orgId: true, projectKey: true, name: true },
    })) ??
    (await db.qtProject.findFirst({
      where: { name: { equals: PROJECT_HINT, mode: "insensitive" }, isDeleted: false },
      select: { id: true, orgId: true, projectKey: true, name: true },
    })) ??
    (await db.qtProject.findFirst({
      where: { name: { contains: "Chat", mode: "insensitive" }, isDeleted: false },
      select: { id: true, orgId: true, projectKey: true, name: true },
    }));

  if (!project) {
    throw new Error(`No project found for "${PROJECT_HINT}". Pass a project id, key, or name as the first arg.`);
  }
  console.log(`Seeding "${project.name}" (${project.projectKey}, ${project.id})`);

  const { id: projectId, orgId, projectKey } = project;

  // 2. Statuses — map category → a concrete statusId for this project.
  const statuses = await db.qtIssueStatus.findMany({
    where: { projectId, isDeleted: false },
    select: { id: true, name: true, category: true, orderIndex: true },
    orderBy: { orderIndex: "asc" },
  });
  if (statuses.length === 0) throw new Error("Project has no statuses — open it once in the UI to seed defaults.");

  const byCategory = (cat: string) => statuses.filter((s) => s.category === cat);
  const todoStatus =
    byCategory("TODO")[0] ?? byCategory("BACKLOG")[0] ?? statuses[0]!;
  // Prefer the *first* in-progress column for IN_PROGRESS, and there are often
  // two (In Progress + In Review) — spread across both when available.
  const inProgressStatuses = byCategory("IN_PROGRESS");
  const inProgress = inProgressStatuses[0] ?? todoStatus;
  const doneStatus = byCategory("DONE")[0] ?? statuses[statuses.length - 1]!;

  function statusForCategory(cat: "TODO" | "IN_PROGRESS" | "DONE") {
    if (cat === "DONE") return doneStatus;
    if (cat === "IN_PROGRESS") return rand(inProgressStatuses.length ? inProgressStatuses : [inProgress]);
    return todoStatus;
  }

  // 3. Members — for assignee/reporter. Fall back to project creator.
  const members = await db.qtProjectMember.findMany({
    where: { projectId, isDeleted: false },
    select: { userId: true },
  });
  let userIds = members.map((m) => m.userId);
  if (userIds.length === 0) {
    const om = await db.orgMember.findFirst({
      where: { orgId, status: "active" },
      select: { userId: true },
    });
    if (!om) throw new Error("No project members or org members to assign issues to.");
    userIds = [om.userId];
  }
  const reporter = userIds[0]!;

  // 4. Active sprint — the board only shows active-sprint issues. Reuse an
  //    existing ACTIVE sprint if there is one, else create one.
  let sprint = await db.qtSprint.findFirst({
    where: { projectId, status: "ACTIVE", isDeleted: false },
    select: { id: true, name: true },
  });
  if (!sprint) {
    const created = await db.qtSprint.create({
      data: {
        projectId,
        name: `${projectKey} Sprint 1`,
        goal: "Ship the real-time messaging MVP",
        status: "ACTIVE",
        startDate: new Date(),
        endDate: new Date(Date.now() + 14 * 24 * 3600 * 1000),
        startedAt: new Date(),
        createdBy: reporter,
      },
      select: { id: true, name: true },
    });
    sprint = created;
    console.log(`  Created active sprint: ${sprint.name}`);
  } else {
    console.log(`  Reusing active sprint: ${sprint.name}`);
  }

  // 5. Sequence base for issue keys.
  let seq = await db.qtIssue.count({ where: { projectId } });

  // 6. Epics (no sprint — epics aren't sprint-scoped; sit above the board).
  const epicIds: string[] = [];
  for (const title of EPICS) {
    seq += 1;
    const epic = await db.qtIssue.create({
      data: {
        orgId,
        projectId,
        key: `${projectKey}-${seq}`,
        title,
        description: `${title} — umbrella epic for the chat application.`,
        type: "EPIC",
        statusId: inProgress.id,
        priority: "HIGH",
        reporterId: reporter,
        assigneeId: rand(userIds),
        startDate: new Date(),
        dueDate: new Date(Date.now() + 45 * 24 * 3600 * 1000),
        storyPoints: 21,
        createdBy: reporter,
        updatedBy: reporter,
      },
      select: { id: true },
    });
    epicIds.push(epic.id);
  }
  console.log(`  Created ${epicIds.length} epics`);

  // 7. Issues — attached to the active sprint, spread across statuses.
  let created = 0;
  let orderInColumn = 0;
  for (const [title, type, cat, sp] of ISSUES) {
    seq += 1;
    const status = statusForCategory(cat);
    const issue = await db.qtIssue.create({
      data: {
        orgId,
        projectId,
        key: `${projectKey}-${seq}`,
        title,
        description: `Description for: ${title}`,
        type,
        statusId: status.id,
        priority: type === "BUG" ? rand(["HIGH", "URGENT", "MEDIUM"]) : rand(PRIORITIES),
        assigneeId: rand(userIds),
        reporterId: reporter,
        sprintId: sprint.id,
        epicId: rand(epicIds),
        orderInColumn: orderInColumn++,
        startDate: new Date(),
        dueDate: new Date(Date.now() + randInt(2, 18) * 24 * 3600 * 1000),
        storyPoints: sp,
        createdBy: reporter,
        updatedBy: reporter,
      },
      select: { id: true },
    });
    created += 1;

    // A few comments.
    const n = randInt(0, 2);
    for (let i = 0; i < n; i++) {
      await db.qtIssueComment.create({
        data: {
          orgId,
          projectId,
          issueId: issue.id,
          userId: rand(userIds),
          body: rand(COMMENTS),
        },
      });
    }
  }

  console.log(`  Created ${created} issues across statuses, attached to "${sprint.name}".`);
  console.log("Done. Open the Board — issues should now appear.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
