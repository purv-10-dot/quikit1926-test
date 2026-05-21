/**
 * Jira → QuikTrack one-shot importer.
 *
 * v1 scope (this file):
 *   - Users: match by email to existing auth.User; auto-create silently for
 *     unmatched (password=null, status="active", inviteMethod="native").
 *     Grants UserAppAccess + assigns the default QuikTrack app role.
 *   - Projects → QtProject (upsert by orgId+projectKey).
 *   - Statuses → QtIssueStatus per project (Jira category → QuikTrack category).
 *   - Issue types → QtIssueType per project.
 *   - Sprints → QtSprint per project (via Agile API boards).
 *   - Issues → QtIssue, in 3 sweeps: Epics → non-subtasks → subtasks.
 *   - Comments → QtIssueComment.
 *   - Worklog → QtTimesheetEntry.
 *
 * NOT in v1:
 *   - Attachments (needs new QtIssueAttachment model + S3 wiring — separate
 *     migration; the importer logs how many were skipped per project).
 *   - Issue changelog / history.
 *   - Custom fields beyond Story Points (auto-detected).
 *
 * The whole import runs synchronously in one HTTP request. For very large
 * Jira sites this could time out; a future iteration should move to a
 * background job. For typical 100–1000-issue projects it completes inside
 * a single Next.js serverless invocation.
 */

import { db } from "@/lib/db";
import { JiraClient, adfToPlainText, type JiraCreds } from "./jira-client";
import {
  seedAllDefaultRoles,
  ensureUserOnRole,
} from "@/lib/api/seedAdminAppRole";
import { getQuikTrackAppId } from "@/lib/api/permissions";
import crypto from "node:crypto";

/* ──────────────────────── Types from Jira REST API ──────────────────────── */

interface JiraUser {
  accountId: string;
  emailAddress: string | null;
  displayName: string;
  active: boolean;
  accountType?: string; // "atlassian" | "app" | "customer"
}
interface JiraProject {
  id: string;
  key: string;
  name: string;
  description?: string;
  projectTypeKey?: string;
  lead?: { accountId: string };
}
interface JiraStatus {
  id: string;
  name: string;
  statusCategory?: { key: string }; // "new" | "indeterminate" | "done" | "undefined"
}
interface JiraIssueType {
  id: string;
  name: string;
  subtask: boolean;
}
interface JiraSprint {
  id: number;
  name: string;
  state: "future" | "active" | "closed" | string;
  startDate?: string;
  endDate?: string;
  goal?: string;
}
interface JiraBoard {
  id: number;
  name: string;
  type: string; // "scrum" | "kanban"
}
interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: unknown; // ADF
    status?: { name: string };
    issuetype?: { name: string; subtask?: boolean };
    priority?: { name: string };
    assignee?: { accountId: string; emailAddress?: string | null } | null;
    reporter?: { accountId: string; emailAddress?: string | null } | null;
    parent?: { key: string };
    duedate?: string;
    created?: string;
    updated?: string;
    [key: string]: unknown; // story points + custom fields live under customfield_xxxxx
  };
}
interface JiraComment {
  id: string;
  body: unknown; // ADF
  author?: { accountId: string; emailAddress?: string | null };
  created: string;
  updated?: string;
}
interface JiraWorklog {
  id: string;
  author?: { accountId: string; emailAddress?: string | null };
  comment?: unknown; // ADF
  started: string;
  timeSpentSeconds: number;
}

/* ──────────────────────── Mapping helpers ──────────────────────── */

const PRIORITY_MAP: Record<string, "LOW" | "MEDIUM" | "HIGH" | "URGENT"> = {
  Highest: "URGENT",
  High: "HIGH",
  Medium: "MEDIUM",
  Low: "LOW",
  Lowest: "LOW",
};

function mapPriority(name?: string): "LOW" | "MEDIUM" | "HIGH" | "URGENT" {
  return (name && PRIORITY_MAP[name]) || "MEDIUM";
}

function mapIssueType(name?: string): "EPIC" | "STORY" | "TASK" | "BUG" | "SUBTASK" {
  switch (name) {
    case "Epic":
      return "EPIC";
    case "Story":
      return "STORY";
    case "Bug":
      return "BUG";
    case "Sub-task":
    case "Subtask":
      return "SUBTASK";
    default:
      return "TASK";
  }
}

function mapStatusCategory(key?: string): "BACKLOG" | "IN_PROGRESS" | "DONE" {
  if (key === "indeterminate") return "IN_PROGRESS";
  if (key === "done") return "DONE";
  return "BACKLOG";
}

function mapSprintState(state: string): "PLANNING" | "ACTIVE" | "COMPLETED" {
  if (state === "active") return "ACTIVE";
  if (state === "closed" || state === "cancelled") return "COMPLETED";
  return "PLANNING";
}

/* ──────────────────────── Report shape returned to the UI ──────────────────────── */

export interface MigrationReport {
  ok: boolean;
  error?: string;
  jiraAccount?: { email: string | null; accountId: string };
  counts: {
    users: { matched: number; created: number };
    projects: number;
    statuses: number;
    issueTypes: number;
    sprints: number;
    issues: number;
    comments: number;
    worklog: number;
    attachmentsSkipped: number;
  };
  /** Project-by-project breakdown for the success screen. */
  projectsImported: Array<{
    key: string;
    name: string;
    issueCount: number;
    sprintCount: number;
  }>;
  /** Jira accountIds we couldn't resolve (privacy-mode users etc). */
  unresolvedUsers: string[];
  /** When `dryRun=true`, no DB writes happened. */
  dryRun: boolean;
}

export interface MigrationOptions {
  creds: JiraCreds;
  /** QuikTrack tenant the data lands in. */
  orgId: string;
  /** UserId of the admin running the import — used for createdBy/grantedBy. */
  actorUserId: string;
  /** Optional whitelist of Jira project keys; empty = import everything. */
  projectKeys?: string[];
  includeComments?: boolean;
  includeWorklog?: boolean;
  /** Skip every DB write but still hit Jira so the counts are real. */
  dryRun?: boolean;
}

/* ──────────────────────── The import driver ──────────────────────── */

export async function migrateFromJira(
  opts: MigrationOptions,
): Promise<MigrationReport> {
  const {
    creds,
    orgId,
    actorUserId,
    projectKeys = [],
    includeComments = true,
    includeWorklog = true,
    dryRun = false,
  } = opts;

  const report: MigrationReport = {
    ok: false,
    counts: {
      users: { matched: 0, created: 0 },
      projects: 0,
      statuses: 0,
      issueTypes: 0,
      sprints: 0,
      issues: 0,
      comments: 0,
      worklog: 0,
      attachmentsSkipped: 0,
    },
    projectsImported: [],
    unresolvedUsers: [],
    dryRun,
  };

  const jira = new JiraClient(creds);

  // 1. Auth probe — fail fast on bad creds.
  try {
    const me = await jira.whoami();
    report.jiraAccount = { email: me.emailAddress, accountId: me.accountId };
  } catch (err) {
    report.error =
      err instanceof Error
        ? `Jira auth failed: ${err.message}`
        : "Jira auth failed";
    return report;
  }

  // 2. Story-points custom field discovery.
  let storyPointsField: string | null = null;
  try {
    const fields = await jira.get<Array<{ id: string; name: string }>>(
      "/rest/api/3/field",
    );
    const sp = fields.find(
      (f) => f.name === "Story Points" || f.name === "Story point estimate",
    );
    storyPointsField = sp?.id ?? null;
  } catch {
    storyPointsField = null;
  }

  // 3. App context for user grants.
  const appId = await getQuikTrackAppId();
  let userRoleId: string | null = null;
  if (appId && !dryRun) {
    const { userRoleId: u } = await seedAllDefaultRoles(orgId);
    userRoleId = u;
  }

  // 4. Build a Jira accountId → QuikTrack userId map by walking all users.
  //    Existing QuikTrack users are matched first; unmatched get auto-created.
  const userMap = new Map<string, string>(); // jira accountId → QtUser id
  const allJiraUsers = await jira.getAllPaged<JiraUser>(
    (startAt, max) =>
      `/rest/api/3/users/search?startAt=${startAt}&maxResults=${max}`,
  );
  // Filter out app/customer users — only humans.
  const humans = allJiraUsers.filter(
    (u) => u.active && u.accountType !== "app" && u.accountType !== "customer",
  );

  for (const j of humans) {
    const lookupEmail = j.emailAddress?.trim().toLowerCase();
    if (!lookupEmail) {
      report.unresolvedUsers.push(j.accountId);
      continue;
    }
    const existing = await db.user.findUnique({
      where: { email: lookupEmail },
      select: { id: true },
    });
    if (existing) {
      userMap.set(j.accountId, existing.id);
      report.counts.users.matched += 1;
      // Ensure OrgMember + UserAppAccess exist for this org — silently grant.
      if (!dryRun) {
        await ensureMembershipAndAccess(existing.id, orgId, actorUserId, appId, userRoleId);
      }
      continue;
    }
    // Auto-create.
    if (dryRun) {
      report.counts.users.created += 1;
      // Use a synthetic id so issue mapping below still finds something.
      userMap.set(j.accountId, `dryrun:${j.accountId}`);
      continue;
    }
    const [firstName, ...rest] = (j.displayName || lookupEmail).split(" ");
    const newUser = await db.user.create({
      data: {
        firstName: firstName || "Jira",
        lastName: rest.join(" ") || "User",
        email: lookupEmail,
        password: null, // SSO-style: they'll use Forgot Password to set one
        mustChangePassword: false,
      },
      select: { id: true },
    });
    await ensureMembershipAndAccess(newUser.id, orgId, actorUserId, appId, userRoleId);
    userMap.set(j.accountId, newUser.id);
    report.counts.users.created += 1;
  }

  // 5. Projects.
  const allJiraProjects = await jira.getAllPaged<JiraProject>(
    (startAt, max) =>
      `/rest/api/3/project/search?startAt=${startAt}&maxResults=${max}`,
  );
  const targetProjects =
    projectKeys.length > 0
      ? allJiraProjects.filter((p) => projectKeys.includes(p.key))
      : allJiraProjects;

  for (const jp of targetProjects) {
    const projectSummary = await migrateOneProject({
      jira,
      jp,
      orgId,
      actorUserId,
      userMap,
      storyPointsField,
      includeComments,
      includeWorklog,
      dryRun,
      report,
    });
    report.projectsImported.push(projectSummary);
  }

  report.counts.projects = report.projectsImported.length;
  report.ok = true;
  return report;
}

/* ──────────────────────── Per-project pipeline ──────────────────────── */

async function migrateOneProject(args: {
  jira: JiraClient;
  jp: JiraProject;
  orgId: string;
  actorUserId: string;
  userMap: Map<string, string>;
  storyPointsField: string | null;
  includeComments: boolean;
  includeWorklog: boolean;
  dryRun: boolean;
  report: MigrationReport;
}): Promise<MigrationReport["projectsImported"][number]> {
  const { jira, jp, orgId, actorUserId, userMap, storyPointsField, includeComments, includeWorklog, dryRun, report } = args;

  // Upsert QtProject keyed on (orgId, projectKey).
  let qtProjectId = "";
  if (!dryRun) {
    const existing = await db.qtProject.findFirst({
      where: { orgId, projectKey: jp.key },
      select: { id: true },
    });
    if (existing) {
      qtProjectId = existing.id;
    } else {
      const created = await db.qtProject.create({
        data: {
          orgId,
          projectKey: jp.key,
          name: jp.name,
          description: jp.description ?? null,
          projectType: jp.projectTypeKey === "service_desk" ? "service" : "software",
          createdBy: actorUserId,
          leadUserId: jp.lead ? userMap.get(jp.lead.accountId) ?? null : null,
        },
        select: { id: true },
      });
      qtProjectId = created.id;
    }
  }

  // Statuses for this project.
  const statusMap = new Map<string, string>(); // jira status id → QtIssueStatus id
  try {
    const statusGroups = await jira.get<
      Array<{ statuses: Array<JiraStatus & { id: string }> }>
    >(`/rest/api/3/project/${encodeURIComponent(jp.key)}/statuses`);
    const flat: JiraStatus[] = [];
    const seen = new Set<string>();
    for (const g of statusGroups) {
      for (const s of g.statuses) {
        if (!seen.has(s.id)) {
          seen.add(s.id);
          flat.push(s);
        }
      }
    }
    let orderIndex = 0;
    for (const s of flat) {
      const category = mapStatusCategory(s.statusCategory?.key);
      if (!dryRun) {
        const existing = await db.qtIssueStatus.findFirst({
          where: { projectId: qtProjectId, name: s.name },
          select: { id: true },
        });
        if (existing) {
          statusMap.set(s.id, existing.id);
        } else {
          const created = await db.qtIssueStatus.create({
            data: {
              projectId: qtProjectId,
              name: s.name,
              category,
              orderIndex: orderIndex++,
              color:
                category === "DONE"
                  ? "#16a34a"
                  : category === "IN_PROGRESS"
                    ? "#2563eb"
                    : "#94a3b8",
            },
            select: { id: true },
          });
          statusMap.set(s.id, created.id);
        }
      } else {
        statusMap.set(s.id, `dryrun:status:${s.id}`);
      }
      report.counts.statuses += 1;
    }
  } catch {
    /* swallow — keep going with any issues we already mapped */
  }

  // Issue types for this project.
  const typeMap = new Map<string, string>(); // jira issuetype name → QtIssueType id
  try {
    const types = await jira.get<JiraIssueType[]>(`/rest/api/3/issuetype/project?projectId=${jp.id}`);
    let orderIndex = 0;
    for (const t of types) {
      if (!dryRun) {
        const existing = await db.qtIssueType.findFirst({
          where: { projectId: qtProjectId, name: t.name },
          select: { id: true },
        });
        if (existing) {
          typeMap.set(t.name, existing.id);
        } else {
          const created = await db.qtIssueType.create({
            data: {
              projectId: qtProjectId,
              name: t.name,
              color: "#64748b",
              orderIndex: orderIndex++,
            },
            select: { id: true },
          });
          typeMap.set(t.name, created.id);
        }
      } else {
        typeMap.set(t.name, `dryrun:type:${t.id}`);
      }
      report.counts.issueTypes += 1;
    }
  } catch {
    /* swallow */
  }

  // Sprints via boards.
  const sprintMap = new Map<number, string>(); // jira sprint id → QtSprint id
  let sprintCount = 0;
  try {
    const boards = await jira.getAllPaged<JiraBoard>(
      (startAt, max) =>
        `/rest/agile/1.0/board?projectKeyOrId=${jp.id}&startAt=${startAt}&maxResults=${max}`,
    );
    const scrumBoards = boards.filter((b) => b.type === "scrum");
    for (const b of scrumBoards) {
      const sprints = await jira.getAllPaged<JiraSprint>(
        (startAt, max) =>
          `/rest/agile/1.0/board/${b.id}/sprint?startAt=${startAt}&maxResults=${max}`,
      );
      for (const s of sprints) {
        if (!dryRun) {
          const existing = await db.qtSprint.findFirst({
            where: { projectId: qtProjectId, name: s.name },
            select: { id: true },
          });
          if (existing) {
            sprintMap.set(s.id, existing.id);
          } else {
            const created = await db.qtSprint.create({
              data: {
                projectId: qtProjectId,
                name: s.name,
                goal: s.goal ?? null,
                status: mapSprintState(s.state),
                startDate: s.startDate ? new Date(s.startDate) : null,
                endDate: s.endDate ? new Date(s.endDate) : null,
                createdBy: actorUserId,
              },
              select: { id: true },
            });
            sprintMap.set(s.id, created.id);
          }
        } else {
          sprintMap.set(s.id, `dryrun:sprint:${s.id}`);
        }
        report.counts.sprints += 1;
        sprintCount += 1;
      }
    }
  } catch {
    /* swallow */
  }

  // Issues — three sweeps so parent/epic links resolve.
  const issueMap = new Map<string, string>(); // jira key → QtIssue id
  let issueCount = 0;

  async function importIssues(jql: string, expectsParent: boolean): Promise<void> {
    const fields = [
      "summary",
      "description",
      "status",
      "issuetype",
      "priority",
      "assignee",
      "reporter",
      "parent",
      "duedate",
      "created",
      "updated",
      "attachment",
      ...(storyPointsField ? [storyPointsField] : []),
    ];

    // Jira deprecated GET /rest/api/3/search in 2024 (returns 410). The
    // replacement is POST /rest/api/3/search/jql with token-based paging:
    // each response carries `nextPageToken` until the last page omits it.
    // See https://developer.atlassian.com/changelog/#CHANGE-2046
    const issues: JiraIssue[] = [];
    let nextPageToken: string | undefined = undefined;
    while (true) {
      const page: { issues?: JiraIssue[]; nextPageToken?: string } =
        await jira.post("/rest/api/3/search/jql", {
          jql,
          fields,
          maxResults: 100,
          ...(nextPageToken ? { nextPageToken } : {}),
        });
      if (Array.isArray(page.issues)) issues.push(...page.issues);
      if (!page.nextPageToken) break;
      nextPageToken = page.nextPageToken;
    }

    for (const ji of issues) {
      const typeName = ji.fields.issuetype?.name ?? "Task";
      const statusName = ji.fields.status?.name ?? "";
      const statusId =
        statusMap.size > 0
          ? [...statusMap.values()][0] // fall back to first status if name lookup misses
          : null;
      // Better: look up by name.
      let resolvedStatusId: string | null = null;
      for (const [_jiraStatusId, qtStatusId] of statusMap.entries()) {
        void _jiraStatusId;
        if (qtStatusId === statusId) resolvedStatusId = qtStatusId;
      }
      // Real name lookup — find the QtIssueStatus row whose name matches.
      if (!dryRun) {
        const named = await db.qtIssueStatus.findFirst({
          where: { projectId: qtProjectId, name: statusName },
          select: { id: true },
        });
        if (named) resolvedStatusId = named.id;
      } else {
        resolvedStatusId = "dryrun:status";
      }
      if (!resolvedStatusId) continue; // unmapped status

      const reporterId =
        ji.fields.reporter?.accountId
          ? userMap.get(ji.fields.reporter.accountId) ?? actorUserId
          : actorUserId;
      const assigneeId = ji.fields.assignee?.accountId
        ? userMap.get(ji.fields.assignee.accountId) ?? null
        : null;
      const parentJiraKey = ji.fields.parent?.key ?? null;
      const parentId =
        expectsParent && parentJiraKey ? issueMap.get(parentJiraKey) ?? null : null;
      const storyPoints =
        storyPointsField && typeof ji.fields[storyPointsField] === "number"
          ? (ji.fields[storyPointsField] as number)
          : null;

      // Attachments — count + skip (no model yet).
      const atts =
        (ji.fields as unknown as { attachment?: Array<unknown> }).attachment ??
        [];
      report.counts.attachmentsSkipped += atts.length;

      if (!dryRun && qtProjectId && resolvedStatusId) {
        // Idempotent by (projectId, key).
        const existing = await db.qtIssue.findFirst({
          where: { projectId: qtProjectId, key: ji.key },
          select: { id: true },
        });
        const description = adfToPlainText(ji.fields.description);
        if (existing) {
          await db.qtIssue.update({
            where: { id: existing.id },
            data: {
              title: ji.fields.summary,
              description: description || null,
              statusId: resolvedStatusId,
              type: mapIssueType(typeName),
              priority: mapPriority(ji.fields.priority?.name),
              assigneeId,
              reporterId,
              ...(parentId ? { parentId } : {}),
              dueDate: ji.fields.duedate ? new Date(ji.fields.duedate) : null,
              ...(storyPoints !== null ? { storyPoints } : {}),
              updatedBy: actorUserId,
            },
          });
          issueMap.set(ji.key, existing.id);
        } else {
          const created = await db.qtIssue.create({
            data: {
              orgId,
              projectId: qtProjectId,
              key: ji.key,
              title: ji.fields.summary,
              description: description || null,
              statusId: resolvedStatusId,
              type: mapIssueType(typeName),
              priority: mapPriority(ji.fields.priority?.name),
              assigneeId,
              reporterId,
              ...(parentId ? { parentId } : {}),
              dueDate: ji.fields.duedate ? new Date(ji.fields.duedate) : null,
              ...(storyPoints !== null ? { storyPoints } : {}),
              createdBy: actorUserId,
            },
            select: { id: true },
          });
          issueMap.set(ji.key, created.id);
        }
      } else if (dryRun) {
        issueMap.set(ji.key, `dryrun:issue:${ji.id}`);
      }
      report.counts.issues += 1;
      issueCount += 1;

      // Comments + worklog after the issue row exists.
      if (!dryRun) {
        if (includeComments) {
          try {
            const cmts = await jira.get<{ comments: JiraComment[] }>(
              `/rest/api/3/issue/${ji.key}/comment?maxResults=200`,
            );
            for (const c of cmts.comments ?? []) {
              const authorQt = c.author?.accountId
                ? userMap.get(c.author.accountId) ?? actorUserId
                : actorUserId;
              await db.qtIssueComment.create({
                data: {
                  orgId,
                  projectId: qtProjectId,
                  issueId: issueMap.get(ji.key)!,
                  userId: authorQt,
                  body: adfToPlainText(c.body),
                },
              });
              report.counts.comments += 1;
            }
          } catch {
            /* swallow */
          }
        }
        if (includeWorklog) {
          try {
            const wls = await jira.get<{ worklogs: JiraWorklog[] }>(
              `/rest/api/3/issue/${ji.key}/worklog?maxResults=200`,
            );
            for (const w of wls.worklogs ?? []) {
              const authorQt = w.author?.accountId
                ? userMap.get(w.author.accountId) ?? actorUserId
                : actorUserId;
              const hours = w.timeSpentSeconds / 3600;
              await db.qtTimesheetEntry.create({
                data: {
                  orgId,
                  userId: authorQt,
                  projectId: qtProjectId,
                  issueId: issueMap.get(ji.key)!,
                  entryDate: new Date(w.started),
                  hours,
                  description: adfToPlainText(w.comment) || null,
                  createdBy: actorUserId,
                },
              });
              report.counts.worklog += 1;
            }
          } catch {
            /* swallow */
          }
        }
      }
    }
  }

  await importIssues(`project="${jp.key}" AND issuetype=Epic ORDER BY created ASC`, false);
  await importIssues(
    `project="${jp.key}" AND issuetype!=Epic AND issuetype!=Sub-task AND issuetype!=Subtask ORDER BY created ASC`,
    false,
  );
  await importIssues(`project="${jp.key}" AND (issuetype=Sub-task OR issuetype=Subtask) ORDER BY created ASC`, true);

  return {
    key: jp.key,
    name: jp.name,
    issueCount,
    sprintCount,
  };
}

/* ──────────────────────── Helpers ──────────────────────── */

async function ensureMembershipAndAccess(
  userId: string,
  orgId: string,
  actorUserId: string,
  appId: string | null,
  userRoleId: string | null,
): Promise<void> {
  // OrgMember — silent grant if missing.
  const om = await db.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
    select: { id: true },
  });
  if (!om) {
    await db.orgMember.create({
      data: {
        orgId,
        userId,
        role: "member",
        status: "active",
        createdBy: actorUserId,
        invitationToken: crypto.randomUUID(),
        invitedAt: new Date(),
        acceptedAt: new Date(),
        inviteMethod: "native",
      },
    });
  }
  if (!appId) return;
  // UserAppAccess.
  const access = await db.userAppAccess.findFirst({
    where: { orgId, appId, userId },
    select: { id: true },
  });
  if (!access) {
    await db.userAppAccess.create({
      data: { userId, orgId, appId, role: "member", grantedBy: actorUserId },
    });
  }
  // QtUserAppRole — default Member role.
  if (userRoleId) {
    await ensureUserOnRole(userId, orgId, userRoleId, actorUserId);
  }
}
