import { db } from "@/lib/db";

/**
 * Snapshot of every issue field we track in the activity history. Pull this
 * with `selectIssueHistorySnapshot` before mutating the row, then call
 * `recordIssueChanges` after the update with the new values.
 */
export type IssueHistorySnapshot = {
  statusId: string | null;
  assigneeId: string | null;
  parentId: string | null;
  epicId: string | null;
  sprintId: string | null;
  priority: string | null;
  type: string | null;
  title: string | null;
  startDate: Date | string | null;
  dueDate: Date | string | null;
  storyPoints: number | null;
  eta: number | null;
};

export const selectIssueHistorySnapshot = {
  statusId: true,
  assigneeId: true,
  parentId: true,
  epicId: true,
  sprintId: true,
  priority: true,
  type: true,
  title: true,
  startDate: true,
  dueDate: true,
  storyPoints: true,
  eta: true,
} as const;

const TRACKED_FIELDS: (keyof IssueHistorySnapshot)[] = [
  "statusId",
  "assigneeId",
  "parentId",
  "epicId",
  "sprintId",
  "priority",
  "type",
  "title",
  "startDate",
  "dueDate",
  "storyPoints",
  "eta",
];

/** Friendly label for the History feed's "changed the X" sentence. */
const FIELD_LABEL: Record<keyof IssueHistorySnapshot, string> = {
  statusId: "Status",
  assigneeId: "Assignee",
  parentId: "Parent",
  epicId: "Epic",
  sprintId: "Sprint",
  priority: "Priority",
  type: "Type",
  title: "Title",
  startDate: "Start date",
  dueDate: "Due date",
  storyPoints: "Story points",
  eta: "ETA",
};

function dateToIsoOrNull(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  return v;
}

/** Equality that treats null/undefined/"" as the same and normalizes dates. */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a instanceof Date) a = a.toISOString();
  if (b instanceof Date) b = b.toISOString();
  if (a == null && b == null) return true;
  return a === b;
}

interface ResolvedNames {
  statuses: Map<string, string>;
  users: Map<string, string>;
  issues: Map<string, string>; // id → "KEY title"
  sprints: Map<string, string>;
}

/**
 * Resolve all the relational ids we need to render human-readable history
 * values (status name, user display name, issue key, sprint name).
 */
async function resolveLabels(
  before: IssueHistorySnapshot,
  after: IssueHistorySnapshot,
): Promise<ResolvedNames> {
  const statusIds = new Set<string>();
  const userIds = new Set<string>();
  const issueIds = new Set<string>();
  const sprintIds = new Set<string>();

  for (const v of [before.statusId, after.statusId]) if (v) statusIds.add(v);
  for (const v of [before.assigneeId, after.assigneeId]) if (v) userIds.add(v);
  for (const v of [before.parentId, after.parentId, before.epicId, after.epicId])
    if (v) issueIds.add(v);
  for (const v of [before.sprintId, after.sprintId]) if (v) sprintIds.add(v);

  const [statuses, users, issues, sprints] = await Promise.all([
    statusIds.size
      ? db.qtIssueStatus.findMany({
          where: { id: { in: Array.from(statusIds) } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    userIds.size
      ? db.user.findMany({
          where: { id: { in: Array.from(userIds) } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : Promise.resolve([]),
    issueIds.size
      ? db.qtIssue.findMany({
          where: { id: { in: Array.from(issueIds) } },
          select: { id: true, key: true, title: true },
        })
      : Promise.resolve([]),
    sprintIds.size
      ? db.qtSprint.findMany({
          where: { id: { in: Array.from(sprintIds) } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  return {
    statuses: new Map(statuses.map((s) => [s.id, s.name])),
    users: new Map(
      users.map((u) => {
        const fn = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
        return [u.id, fn || u.email] as const;
      }),
    ),
    issues: new Map(issues.map((i) => [i.id, `${i.key}${i.title ? " " + i.title : ""}`])),
    sprints: new Map(sprints.map((s) => [s.id, s.name])),
  };
}

function renderValue(
  field: keyof IssueHistorySnapshot,
  value: unknown,
  names: ResolvedNames,
): string | null {
  if (value == null || value === "") return null;
  const id = value as string;
  if (field === "statusId") return names.statuses.get(id) ?? id;
  if (field === "assigneeId") return names.users.get(id) ?? id;
  if (field === "parentId" || field === "epicId") return names.issues.get(id) ?? id;
  if (field === "sprintId") return names.sprints.get(id) ?? id;
  if (field === "startDate" || field === "dueDate") {
    const iso = dateToIsoOrNull(value as Date | string);
    return iso ? new Date(iso).toLocaleDateString() : null;
  }
  return String(value);
}

/**
 * Compares before/after snapshots and writes one QtIssueHistory row per
 * tracked field that actually changed. Designed to be `void`'d from the
 * caller — failures are swallowed so the API response never blocks on the
 * history write.
 */
export async function recordIssueChanges(args: {
  orgId: string;
  projectId: string;
  issueId: string;
  userId: string | null;
  before: IssueHistorySnapshot;
  after: IssueHistorySnapshot;
}): Promise<void> {
  const changedFields: (keyof IssueHistorySnapshot)[] = [];
  for (const f of TRACKED_FIELDS) {
    if (!valuesEqual(args.before[f], args.after[f])) changedFields.push(f);
  }
  if (changedFields.length === 0) return;
  try {
    const names = await resolveLabels(args.before, args.after);
    await db.qtIssueHistory.createMany({
      data: changedFields.map((f) => ({
        orgId: args.orgId,
        projectId: args.projectId,
        issueId: args.issueId,
        userId: args.userId ?? null,
        field: FIELD_LABEL[f],
        oldValue: renderValue(f, args.before[f], names),
        newValue: renderValue(f, args.after[f], names),
      })),
    });
  } catch (error: unknown) {
    console.error("[issue-history] failed to write rows", error);
  }
}

/**
 * Convenience wrapper for events that don't have before/after pairs — link
 * add/remove, comment add, etc. Writes a single row directly.
 */
export async function recordIssueEvent(args: {
  orgId: string;
  projectId: string;
  issueId: string;
  userId: string | null;
  field: string;
  oldValue: string | null;
  newValue: string | null;
}): Promise<void> {
  try {
    await db.qtIssueHistory.create({
      data: {
        orgId: args.orgId,
        projectId: args.projectId,
        issueId: args.issueId,
        userId: args.userId ?? null,
        field: args.field,
        oldValue: args.oldValue,
        newValue: args.newValue,
      },
    });
  } catch (error: unknown) {
    console.error("[issue-history] failed to write event", error);
  }
}
