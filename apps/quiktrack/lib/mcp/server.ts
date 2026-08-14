import { createMcpHandler, fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import type { Prisma } from "@prisma/client";
// QUIKTR-118: every Prisma call in this file must go through the guarded
// client — it throws before any delete or deleteMany call reaches the
// database. See docs/mcp-security.md.
import { mcpDb as db } from "@/lib/mcp/guardedDb";
import { buildQqlOrderBy, buildQqlWhere, parseQql, QqlParseError } from "@/lib/services/qql";
import { loadAccessibleProjects, loadProjectAccess } from "@/lib/api/withProjectAccess";
import { userCanInProject } from "@/lib/api/permissions";
import {
  createIssueSchema,
  issuePriorityEnum,
  issueTypeEnum,
  moveIssueSchema,
  updateIssueSchema,
} from "@/lib/validation/issue";
import { ISSUE_LINK_TYPES } from "@/lib/services/issueLinkTypes";
import { createSprintSchema } from "@/lib/validation/sprint";
import { getDefaultStatusId } from "@/lib/services/projectDefaults";
import { recordIssueChanges, recordIssueEvent, selectIssueHistorySnapshot } from "@/lib/services/issueHistory";
import { createCommentSchema } from "@/lib/validation/comment";
import { addRemoteLinkSchema as addRemoteLinkInput } from "@/lib/validation/remoteLink";
import { createTimesheetSchema } from "@/lib/validation/timesheet";
import { parseWorklogTimeSpent } from "@/lib/utils/timesheetPeriod";
import { createTimesheetEntry, listWorklogsForIssue, TimesheetFutureDateError } from "@/lib/services/timesheet";
import { renderCfValue } from "@/lib/customFields/render";
import { filterUpdatePayload } from "@/lib/api/fieldLevels";
import { getActiveFieldsForProject, validateIssueValues, writeIssueValues } from "@/lib/services/customFieldValues";
import type { FieldValue } from "@/lib/customFields/registry";
import {
  executeTransition,
  listAvailableTransitionsForIssue,
  TransitionNotAllowedError,
  ConditionsFailedError,
  ValidationFailedError,
  type ExecuteResult,
} from "@/lib/services/workflow";
import { recordSprintVelocity } from "@/lib/reports/sprint-snapshot";

const createIssueInput = createIssueSchema.omit({ projectId: true });
const createSprintInput = createSprintSchema.omit({ projectId: true });
const updateIssueInput = updateIssueSchema;

/**
 * Built-in create_issue fields (QUIKTR-115), hand-mirrored from
 * createIssueSchema field-by-field — Zod has no runtime "required + enum
 * values" reflection API, so this is kept in sync by hand. Update this list
 * if createIssueSchema (lib/validation/issue.ts) gains/changes a field.
 */
const BUILTIN_CREATE_FIELDS: {
  key: string;
  label: string;
  required: boolean;
  dataType: "string" | "number" | "datetime" | "enum";
  allowedValues?: string[];
}[] = [
  { key: "title", label: "Title", required: true, dataType: "string" },
  { key: "type", label: "Type", required: false, dataType: "enum", allowedValues: [...issueTypeEnum.options] },
  { key: "priority", label: "Priority", required: false, dataType: "enum", allowedValues: [...issuePriorityEnum.options] },
  { key: "description", label: "Description", required: false, dataType: "string" },
  { key: "statusId", label: "Status", required: false, dataType: "string" },
  { key: "parentId", label: "Parent issue", required: false, dataType: "string" },
  { key: "epicId", label: "Epic", required: false, dataType: "string" },
  { key: "sprintId", label: "Sprint", required: false, dataType: "string" },
  { key: "assigneeId", label: "Assignee", required: false, dataType: "string" },
  { key: "startDate", label: "Start date", required: false, dataType: "datetime" },
  { key: "dueDate", label: "Due date", required: false, dataType: "datetime" },
  { key: "eta", label: "Estimate (hours)", required: false, dataType: "number" },
  { key: "storyPoints", label: "Story points", required: false, dataType: "number" },
];

// createSprintSchema requires a full ISO 8601 datetime, but callers (LLMs in
// particular) naturally send a bare date like "2026-08-03". Widen just the
// MCP entrypoint to accept that shorthand rather than loosen the shared
// schema also used by the REST route.
function normalizeDateOnly(value: unknown): unknown {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
}

/** Minimal issue shape the workflow engine needs (see RuleIssueSnapshot). */
type TransitionIssueSnapshot = {
  id: string;
  orgId: string;
  projectId: string;
  type: string;
  statusId: string;
  assigneeId: string | null;
  resolutionId: string | null;
  priority: string | null;
};

type LegalTransitionTarget = { toStatusId: string; toStatusName: string; category: string };

/**
 * Legal next statuses for an issue, tagged with name/category (QUIKTR-114).
 * Uses the published workflow graph when the project/issue-type has one.
 * Falls back to every other project status when ungated (v1 behavior per the
 * ticket spec — the tool's response shape doesn't change when a real
 * workflow graph is added for a currently-ungated project).
 */
async function legalTransitionTargets(params: {
  issue: TransitionIssueSnapshot;
  userId: string;
}): Promise<LegalTransitionTarget[]> {
  const { issue, userId } = params;
  const { gated, transitions } = await listAvailableTransitionsForIssue({ issue, userId });

  if (gated) {
    const statuses = await db.qtIssueStatus.findMany({
      where: { id: { in: transitions.map((t) => t.toStatusId) } },
      select: { id: true, name: true, category: true },
    });
    const byId = new Map(statuses.map((s) => [s.id, s] as const));
    const out: LegalTransitionTarget[] = [];
    for (const t of transitions) {
      const s = byId.get(t.toStatusId);
      if (s) out.push({ toStatusId: s.id, toStatusName: s.name, category: s.category });
    }
    return out;
  }

  const statuses = await db.qtIssueStatus.findMany({
    where: { projectId: issue.projectId, isDeleted: false, id: { not: issue.statusId } },
    orderBy: { orderIndex: "asc" },
    select: { id: true, name: true, category: true },
  });
  return statuses.map((s) => ({ toStatusId: s.id, toStatusName: s.name, category: s.category }));
}

/** Maps a workflow-transition error to an MCP tool error result, or `null`
 *  if `error` isn't one of the three transition errors. A rejected status
 *  move (TransitionNotAllowedError) enumerates the legal targets so the
 *  caller isn't left guessing (QUIKTR-114). */
async function transitionErrorContent(
  error: unknown,
  ctx: { issue: TransitionIssueSnapshot; userId: string },
): Promise<{ content: [{ type: "text"; text: string }]; isError: true } | null> {
  if (error instanceof TransitionNotAllowedError) {
    const targets = await legalTransitionTargets(ctx);
    const legalText = targets.length
      ? targets.map((t) => `${t.toStatusName} (${t.toStatusId})`).join(", ")
      : "none — this issue has no outgoing transitions from its current status";
    return { content: [{ type: "text", text: `${error.message}. Legal targets: ${legalText}` }], isError: true };
  }
  if (error instanceof ConditionsFailedError) {
    return { content: [{ type: "text", text: error.message }], isError: true };
  }
  if (error instanceof ValidationFailedError) {
    return {
      content: [{ type: "text", text: error.failures.map((f) => f.message).join(" ") }],
      isError: true,
    };
  }
  return null;
}

const ISSUE_LINK_SELECT = {
  id: true,
  key: true,
  title: true,
  statusId: true,
  status: { select: { id: true, name: true, color: true, category: true } },
} as const;

type LinkedIssue = {
  id: string;
  key: string;
  title: string;
  statusId: string;
  status: { id: string; name: string; color: string; category: string } | null;
};

type IssueLinkEntry = { id: string; type: string; relationship: string; issue: LinkedIssue };

/**
 * An issue's internal links in both directions (QUIKTR-116) — shared by
 * `list_issue_links` and `get_issue` so the two never drift. Outward: this
 * issue is the source, relationship uses the type's outward label (e.g.
 * "blocks"). Inward: this issue is the target, relationship uses the type's
 * inward label (e.g. "is blocked by").
 */
async function loadIssueLinks(
  orgId: string,
  issueId: string,
): Promise<{ outward: IssueLinkEntry[]; inward: IssueLinkEntry[] }> {
  const [outwardRows, inwardRows] = await Promise.all([
    db.qtIssueLink.findMany({
      where: { orgId, sourceIssueId: issueId },
      orderBy: { createdAt: "asc" },
      select: { id: true, type: true, targetIssue: { select: ISSUE_LINK_SELECT } },
    }),
    db.qtIssueLink.findMany({
      where: { orgId, targetIssueId: issueId },
      orderBy: { createdAt: "asc" },
      select: { id: true, type: true, sourceIssue: { select: ISSUE_LINK_SELECT } },
    }),
  ]);

  const labelFor = (type: string) => ISSUE_LINK_TYPES.find((t) => t.type === type);

  return {
    outward: outwardRows.map((r) => ({
      id: r.id,
      type: r.type,
      relationship: labelFor(r.type)?.outward ?? r.type,
      issue: r.targetIssue,
    })),
    inward: inwardRows.map((r) => ({
      id: r.id,
      type: r.type,
      relationship: labelFor(r.type)?.inward ?? r.type,
      issue: r.sourceIssue,
    })),
  };
}

export interface McpAuthExtra {
  orgId: string;
  /** The PAT's own bound project, if any — null for a user-scoped token.
   * Not the project for any given tool call; see `resolveRequestedProjectId`. */
  projectId: string | null;
  userId: string;
  /** Always "agent" — every MCP caller is a PAT-authenticated tool, never a human session. */
  actorType: "user" | "agent";
}

/**
 * Reconciles the PAT's own bound project (if it's a legacy project-scoped
 * token) with the `projectId` a tool call optionally supplies. A
 * project-scoped token always resolves to its own project, and rejects a
 * call that names a different one — preserving the existing "cannot touch
 * any other project" guarantee. A user-scoped token (no bound project) has
 * no default and must be told which project to act on.
 */
function resolveRequestedProjectId(
  tokenProjectId: string | null,
  argsProjectId?: string,
): { ok: true; projectId: string } | { ok: false; error: string } {
  if (tokenProjectId) {
    if (argsProjectId && argsProjectId !== tokenProjectId) {
      return { ok: false, error: "This token is scoped to a single project and cannot act on a different one." };
    }
    return { ok: true, projectId: tokenProjectId };
  }
  if (!argsProjectId) {
    return {
      ok: false,
      error: "This token isn't scoped to a single project — pass a projectId (see list_projects).",
    };
  }
  return { ok: true, projectId: argsProjectId };
}

export const mcpHandler = createMcpHandler(({ authInfo }) => {
  const { orgId, projectId: tokenProjectId, userId, actorType } = authInfo?.extra as unknown as McpAuthExtra;
  const server = new McpServer({ name: "quiktrack", version: "1.0.0" });

  server.registerTool(
    "list_projects",
    {
      description:
        "List the projects this token can act on. A user-scoped token has no default project, so call this first to find a valid projectId to pass to every other tool.",
      inputSchema: fromJsonSchema({ type: "object", properties: {} }),
    },
    async () => {
      const projects = tokenProjectId
        ? await db.qtProject.findMany({
            where: { id: tokenProjectId, orgId, isDeleted: false },
            select: { id: true, projectKey: true, name: true },
          })
        : await loadAccessibleProjects(orgId, userId);
      return { content: [{ type: "text", text: JSON.stringify(projects) }] };
    },
  );

  server.registerTool(
    "get_issue",
    {
      description: "Get a QuikTrack issue by id. Pass projectId if this token isn't scoped to a single project.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: { issueId: { type: "string" }, projectId: { type: "string" } },
        required: ["issueId"],
      }),
    },
    async (args: unknown) => {
      const { issueId, projectId: rawProjectId } = args as { issueId: string; projectId?: string };
      const resolved = resolveRequestedProjectId(tokenProjectId, rawProjectId);
      if (!resolved.ok) {
        return { content: [{ type: "text", text: resolved.error }], isError: true };
      }
      const { projectId } = resolved;
      const access = await loadProjectAccess(orgId, userId, projectId);
      if (!access) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      const issue = await db.qtIssue.findFirst({
        where: { id: issueId, orgId, projectId, isDeleted: false },
        select: {
          id: true,
          key: true,
          title: true,
          description: true,
          type: true,
          priority: true,
          statusId: true,
          assigneeId: true,
        },
      });
      if (!issue) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      const links = await loadIssueLinks(orgId, issue.id);
      return { content: [{ type: "text", text: JSON.stringify({ ...issue, links }) }] };
    },
  );

  server.registerTool(
    "get_project",
    {
      description: "Get a QuikTrack project's details. Pass projectId if this token isn't scoped to a single project.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: { projectId: { type: "string" } },
      }),
    },
    async (args: unknown) => {
      const { projectId: rawProjectId } = args as { projectId?: string };
      const resolved = resolveRequestedProjectId(tokenProjectId, rawProjectId);
      if (!resolved.ok) {
        return { content: [{ type: "text", text: resolved.error }], isError: true };
      }
      const { projectId } = resolved;
      const access = await loadProjectAccess(orgId, userId, projectId);
      if (!access) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      const project = await db.qtProject.findFirst({
        where: { id: projectId, orgId, isDeleted: false },
        select: {
          id: true,
          projectKey: true,
          name: true,
          description: true,
          statuses: {
            where: { isDeleted: false },
            orderBy: { orderIndex: "asc" },
            select: { id: true, name: true, color: true, category: true },
          },
        },
      });
      if (!project) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(project) }] };
    },
  );

  server.registerTool(
    "list_custom_fields",
    {
      description:
        "List the custom field definitions available on a project. Use a field's `id` as the key in quiktrack_update_issue's customFields. Pass projectId if this token isn't scoped to a single project.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: { projectId: { type: "string" } },
      }),
    },
    async (args: unknown) => {
      const { projectId: rawProjectId } = args as { projectId?: string };
      const resolved = resolveRequestedProjectId(tokenProjectId, rawProjectId);
      if (!resolved.ok) {
        return { content: [{ type: "text", text: resolved.error }], isError: true };
      }
      const { projectId } = resolved;
      const access = await loadProjectAccess(orgId, userId, projectId);
      if (!access) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      const fields = await getActiveFieldsForProject(orgId, projectId);
      return { content: [{ type: "text", text: JSON.stringify(fields) }] };
    },
  );

  server.registerTool(
    "list_issue_types",
    {
      description:
        "List the issue types available in a project (id, name, isSubtask). Pass projectId if this token isn't scoped to a single project.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: { projectId: { type: "string" } },
      }),
    },
    async (args: unknown) => {
      const { projectId: rawProjectId } = args as { projectId?: string };
      const resolved = resolveRequestedProjectId(tokenProjectId, rawProjectId);
      if (!resolved.ok) {
        return { content: [{ type: "text", text: resolved.error }], isError: true };
      }
      const { projectId } = resolved;
      const access = await loadProjectAccess(orgId, userId, projectId);
      if (!access) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      const rows = await db.qtIssueType.findMany({
        where: { projectId, isDeleted: false },
        orderBy: { orderIndex: "asc" },
        select: { id: true, name: true },
      });
      // QtIssueType.name is stored Title Case ("Task", "Bug"), but QtIssue.type
      // and every other MCP tool (get_issue, create_issue, search_issues) use
      // uppercase codes ("TASK", "BUG") — surface the form callers actually need.
      const types = rows.map((r) => {
        const name = r.name.trim().toUpperCase();
        return { id: r.id, name, isSubtask: name === "SUBTASK" };
      });
      return { content: [{ type: "text", text: JSON.stringify(types) }] };
    },
  );

  server.registerTool(
    "get_create_field_metadata",
    {
      description:
        "Fields available when creating an issue of a given type: key, label, required flag, data type, and allowed values for enum/dropdown fields. Read this before calling create_issue. Pass projectId if this token isn't scoped to a single project.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: { projectId: { type: "string" }, type: { type: "string" } },
        required: ["type"],
      }),
    },
    async (args: unknown) => {
      const { type: rawType, projectId: rawProjectId } = args as { type: string; projectId?: string };
      const resolved = resolveRequestedProjectId(tokenProjectId, rawProjectId);
      if (!resolved.ok) {
        return { content: [{ type: "text", text: resolved.error }], isError: true };
      }
      const { projectId } = resolved;
      const access = await loadProjectAccess(orgId, userId, projectId);
      if (!access) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      const typeParsed = issueTypeEnum.safeParse(String(rawType ?? "").toUpperCase());
      if (!typeParsed.success) {
        return {
          content: [
            {
              type: "text",
              text: `Unknown type "${rawType}". create_issue only supports: ${issueTypeEnum.options.join(", ")}.`,
            },
          ],
          isError: true,
        };
      }

      const customFields = await getActiveFieldsForProject(orgId, projectId);
      const customFieldEntries = customFields.map((f) => ({
        key: f.id,
        label: f.name,
        required: f.isRequired,
        dataType: f.type,
        ...((f.type === "DROPDOWN_SINGLE" || f.type === "DROPDOWN_MULTI") && {
          allowedValues: f.options.map((o) => o.value),
        }),
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              type: typeParsed.data,
              fields: [...BUILTIN_CREATE_FIELDS, ...customFieldEntries],
            }),
          },
        ],
      };
    },
  );

  server.registerTool(
    "list_link_types",
    {
      description:
        "List the internal issue-link types (e.g. blocks/is blocked by, relates to, duplicates/is duplicated by) usable with link_issues.",
      inputSchema: fromJsonSchema({ type: "object", properties: {} }),
    },
    async () => {
      return { content: [{ type: "text", text: JSON.stringify(ISSUE_LINK_TYPES) }] };
    },
  );

  server.registerTool(
    "get_member",
    {
      description: "Get a project member's profile by userId. Pass projectId if this token isn't scoped to a single project.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: { userId: { type: "string" }, projectId: { type: "string" } },
        required: ["userId"],
      }),
    },
    async (args: unknown) => {
      const { userId: targetUserId, projectId: rawProjectId } = args as { userId: string; projectId?: string };
      const resolved = resolveRequestedProjectId(tokenProjectId, rawProjectId);
      if (!resolved.ok) {
        return { content: [{ type: "text", text: resolved.error }], isError: true };
      }
      const { projectId } = resolved;
      const access = await loadProjectAccess(orgId, userId, projectId);
      if (!access) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      const member = await db.qtProjectMember.findFirst({
        where: { projectId, userId: targetUserId, isDeleted: false },
        select: { id: true, userId: true, role: true },
      });
      if (!member) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      const user = await db.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
      });
      return { content: [{ type: "text", text: JSON.stringify({ ...member, user }) }] };
    },
  );

  server.registerTool(
    "search_users",
    {
      description: "Find project members to assign an issue to. Pass projectId if this token isn't scoped to a single project.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: { query: { type: "string" }, projectId: { type: "string" } },
      }),
    },
    async (args: unknown) => {
      const { query, projectId: rawProjectId } = args as { query?: string; projectId?: string };
      const resolved = resolveRequestedProjectId(tokenProjectId, rawProjectId);
      if (!resolved.ok) {
        return { content: [{ type: "text", text: resolved.error }], isError: true };
      }
      const { projectId } = resolved;
      const access = await loadProjectAccess(orgId, userId, projectId);
      if (!access) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      const members = await db.qtProjectMember.findMany({
        where: { projectId, isDeleted: false },
        select: { userId: true },
      });
      const memberUserIds = members.map((m) => m.userId);
      if (memberUserIds.length === 0) {
        return { content: [{ type: "text", text: "[]" }] };
      }
      const trimmedQuery = query?.trim();
      const users = await db.user.findMany({
        where: {
          id: { in: memberUserIds },
          ...(trimmedQuery
            ? {
                OR: [
                  { email: { contains: trimmedQuery, mode: "insensitive" } },
                  { firstName: { contains: trimmedQuery, mode: "insensitive" } },
                  { lastName: { contains: trimmedQuery, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        take: 50,
        select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
      });
      return { content: [{ type: "text", text: JSON.stringify(users) }] };
    },
  );

  server.registerTool(
    "create_issue",
    {
      description: "Create a QuikTrack issue. Pass projectId if this token isn't scoped to a single project.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          type: { type: "string", enum: ["EPIC", "TASK", "STORY", "BUG", "SUBTASK"] },
          priority: { type: "string", enum: ["LOWEST", "LOW", "MEDIUM", "HIGH", "HIGHEST"] },
          statusId: { type: "string" },
          parentId: { type: "string" },
          epicId: { type: "string" },
          sprintId: { type: "string" },
          assigneeId: { type: "string" },
          projectId: { type: "string" },
        },
        required: ["title"],
      }),
    },
    async (args: unknown) => {
      const { projectId: rawProjectId } = args as { projectId?: string };
      const resolved = resolveRequestedProjectId(tokenProjectId, rawProjectId);
      if (!resolved.ok) {
        return { content: [{ type: "text", text: resolved.error }], isError: true };
      }
      const { projectId } = resolved;
      const access = await loadProjectAccess(orgId, userId, projectId);
      if (!access) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      if (!access.isTenantAdmin && !(await userCanInProject(userId, orgId, projectId, "Issue", "create"))) {
        return { content: [{ type: "text", text: "You don't have access to this." }], isError: true };
      }

      const parsed = createIssueInput.safeParse(args);
      if (!parsed.success) {
        return {
          content: [{ type: "text", text: parsed.error.issues.map((i) => i.message).join(", ") }],
          isError: true,
        };
      }

      const project = await db.qtProject.findFirst({
        where: { id: projectId, orgId, isDeleted: false },
        select: { projectKey: true },
      });
      if (!project) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }

      const issue = await db.$transaction(async (tx) => {
        const statusId = parsed.data.statusId ?? (await getDefaultStatusId(tx, projectId));
        if (!statusId) throw new Error("Project has no statuses");

        const seq = await tx.qtIssue.count({ where: { projectId } });
        const key = `${project.projectKey}-${seq + 1}`;

        return tx.qtIssue.create({
          data: {
            orgId,
            projectId,
            key,
            title: parsed.data.title,
            description: parsed.data.description,
            type: parsed.data.type,
            statusId,
            priority: parsed.data.priority,
            parentId: parsed.data.parentId,
            epicId: parsed.data.epicId,
            sprintId: parsed.data.sprintId,
            assigneeId: parsed.data.assigneeId,
            reporterId: userId,
            createdBy: userId,
            updatedBy: userId,
          },
          select: {
            id: true,
            key: true,
            title: true,
            description: true,
            type: true,
            priority: true,
            statusId: true,
            assigneeId: true,
          },
        });
      }, { timeout: 20_000, maxWait: 5_000 });

      return { content: [{ type: "text", text: JSON.stringify(issue) }] };
    },
  );

  server.registerTool(
    "list_comments",
    {
      description: "List an issue's comments, oldest first. Pass projectId if this token isn't scoped to a single project.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: { issueId: { type: "string" }, projectId: { type: "string" } },
        required: ["issueId"],
      }),
    },
    async (args: unknown) => {
      const { issueId, projectId: rawProjectId } = args as { issueId: string; projectId?: string };
      const resolved = resolveRequestedProjectId(tokenProjectId, rawProjectId);
      if (!resolved.ok) {
        return { content: [{ type: "text", text: resolved.error }], isError: true };
      }
      const { projectId } = resolved;
      const access = await loadProjectAccess(orgId, userId, projectId);
      if (!access) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      const issue = await db.qtIssue.findFirst({
        where: { id: issueId, orgId, projectId, isDeleted: false },
        select: { id: true },
      });
      if (!issue) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      const comments = await db.qtIssueComment.findMany({
        where: { orgId, issueId, isDeleted: false },
        orderBy: { createdAt: "asc" },
        select: { id: true, userId: true, body: true, createdAt: true, editedAt: true },
      });
      const commentUserIds = Array.from(new Set(comments.map((c) => c.userId)));
      const users = commentUserIds.length
        ? await db.user.findMany({
            where: { id: { in: commentUserIds } },
            select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
          })
        : [];
      const userById = new Map(users.map((u) => [u.id, u] as const));
      const data = comments.map((c) => ({ ...c, user: userById.get(c.userId) ?? null }));
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    },
  );

  server.registerTool(
    "start_sprint",
    {
      description: "Transition a PLANNING sprint to ACTIVE. Pass projectId if this token isn't scoped to a single project.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: { sprintId: { type: "string" }, projectId: { type: "string" } },
        required: ["sprintId"],
      }),
    },
    async (args: unknown) => {
      const { sprintId, projectId: rawProjectId } = args as { sprintId: string; projectId?: string };
      const resolved = resolveRequestedProjectId(tokenProjectId, rawProjectId);
      if (!resolved.ok) {
        return { content: [{ type: "text", text: resolved.error }], isError: true };
      }
      const { projectId } = resolved;
      const access = await loadProjectAccess(orgId, userId, projectId);
      if (!access) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      const sprint = await db.qtSprint.findFirst({
        where: { id: sprintId, projectId, isDeleted: false },
        select: { id: true, status: true },
      });
      if (!sprint) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      if (sprint.status !== "PLANNING") {
        return { content: [{ type: "text", text: `Sprint already ${sprint.status}` }], isError: true };
      }
      if (!access.isTenantAdmin && !(await userCanInProject(userId, orgId, projectId, "Sprint", "update"))) {
        return { content: [{ type: "text", text: "You don't have access to this." }], isError: true };
      }

      const updated = await db.qtSprint.update({
        where: { id: sprintId },
        data: { status: "ACTIVE", startedAt: new Date(), updatedBy: userId },
        select: { id: true, name: true, status: true, startedAt: true },
      });
      return { content: [{ type: "text", text: JSON.stringify(updated) }] };
    },
  );

  server.registerTool(
    "list_transitions",
    {
      description:
        "List the legal next statuses for an issue from its current status, honoring the project's workflow rules (not just every status in the project). Pass projectId if this token isn't scoped to a single project.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: { issueId: { type: "string" }, projectId: { type: "string" } },
        required: ["issueId"],
      }),
    },
    async (args: unknown) => {
      const { issueId, projectId: rawProjectId } = args as { issueId: string; projectId?: string };
      const resolved = resolveRequestedProjectId(tokenProjectId, rawProjectId);
      if (!resolved.ok) {
        return { content: [{ type: "text", text: resolved.error }], isError: true };
      }
      const { projectId } = resolved;
      const access = await loadProjectAccess(orgId, userId, projectId);
      if (!access) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      const issue = await db.qtIssue.findFirst({
        where: { id: issueId, orgId, projectId, isDeleted: false },
        select: { id: true, statusId: true, type: true, assigneeId: true, resolutionId: true, priority: true },
      });
      if (!issue) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }

      const transitions = await legalTransitionTargets({
        issue: {
          id: issue.id,
          orgId,
          projectId,
          type: issue.type ?? "TASK",
          statusId: issue.statusId as string,
          assigneeId: issue.assigneeId ?? null,
          resolutionId: issue.resolutionId ?? null,
          priority: issue.priority ?? null,
        },
        userId,
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ fromStatusId: issue.statusId, transitions }) }],
      };
    },
  );

  server.registerTool(
    "move_issue",
    {
      description: "Transition an issue between status/sprint/parent/column position. Pass projectId if this token isn't scoped to a single project.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {
          issueId: { type: "string" },
          statusId: { type: "string" },
          sprintId: { type: ["string", "null"] },
          parentId: { type: ["string", "null"] },
          orderInColumn: { type: "number" },
          projectId: { type: "string" },
        },
        required: ["issueId"],
      }),
    },
    async (args: unknown) => {
      const { issueId, projectId: rawProjectId, ...rest } = args as {
        issueId: string;
        projectId?: string;
        [key: string]: unknown;
      };
      const resolved = resolveRequestedProjectId(tokenProjectId, rawProjectId);
      if (!resolved.ok) {
        return { content: [{ type: "text", text: resolved.error }], isError: true };
      }
      const { projectId } = resolved;
      const access = await loadProjectAccess(orgId, userId, projectId);
      if (!access) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      const issue = await db.qtIssue.findFirst({
        where: { id: issueId, orgId, projectId, isDeleted: false },
        select: { id: true, key: true, resolutionId: true, ...selectIssueHistorySnapshot },
      });
      if (!issue) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      if (!access.isTenantAdmin && !(await userCanInProject(userId, orgId, projectId, "Issue", "update"))) {
        return { content: [{ type: "text", text: "You don't have access to this." }], isError: true };
      }

      const parsed = moveIssueSchema.safeParse(rest);
      if (!parsed.success) {
        return {
          content: [{ type: "text", text: parsed.error.issues.map((i) => i.message).join(", ") }],
          isError: true,
        };
      }

      // A statusId change must go through the workflow-transition pipeline
      // (conditions/validators/post-functions + audit log), same as the
      // issue detail panel's move — see app/api/issues/[id]/route.ts PATCH.
      const isStatusChange = parsed.data.statusId != null && parsed.data.statusId !== issue.statusId;
      let workflowPatch: ExecuteResult["patch"] = {};
      let workflowComments: string[] = [];
      if (isStatusChange) {
        const issueSnapshot: TransitionIssueSnapshot = {
          id: issue.id,
          orgId,
          projectId,
          type: issue.type ?? "TASK",
          statusId: issue.statusId as string,
          assigneeId: issue.assigneeId ?? null,
          resolutionId: issue.resolutionId ?? null,
          priority: issue.priority ?? null,
        };
        try {
          const res = await executeTransition({
            issue: issueSnapshot,
            toStatusId: parsed.data.statusId as string,
            userId,
          });
          workflowPatch = res.patch ?? {};
          workflowComments = res.comments ?? [];
        } catch (error: unknown) {
          const mapped = await transitionErrorContent(error, { issue: issueSnapshot, userId });
          if (mapped) return mapped;
          throw error;
        }
      }

      const updated = await db.$transaction(async (tx) => {
        const issueAfter = await tx.qtIssue.update({
          where: { id: issueId },
          data: {
            statusId: parsed.data.statusId,
            sprintId: parsed.data.sprintId === undefined ? undefined : parsed.data.sprintId,
            parentId: parsed.data.parentId === undefined ? undefined : parsed.data.parentId,
            orderInColumn: parsed.data.orderInColumn,
            ...("assigneeId" in workflowPatch ? { assigneeId: workflowPatch.assigneeId } : {}),
            ...("resolutionId" in workflowPatch ? { resolutionId: workflowPatch.resolutionId } : {}),
            ...(typeof workflowPatch.priority === "string" ? { priority: workflowPatch.priority } : {}),
            updatedBy: userId,
          },
          select: { id: true, key: true, orderInColumn: true, ...selectIssueHistorySnapshot },
        });
        if (isStatusChange) {
          await tx.qtIssueTransitionLog.create({
            data: {
              orgId,
              issueId: issue.id,
              fromStatusId: issue.statusId as string,
              toStatusId: parsed.data.statusId as string,
              actorId: userId,
              actorType,
            },
          });
        }
        if (workflowComments.length > 0) {
          await tx.qtIssueComment.createMany({
            data: workflowComments.map((body) => ({
              orgId,
              projectId,
              issueId: issue.id,
              userId,
              body,
              actorType,
            })),
          });
        }
        return issueAfter;
      });
      void recordIssueChanges({
        orgId,
        projectId,
        issueId: issue.id,
        userId,
        before: issue,
        after: updated,
        actorType,
      });
      return { content: [{ type: "text", text: JSON.stringify(updated) }] };
    },
  );

  server.registerTool(
    "create_sprint",
    {
      description: "Create a sprint. Pass projectId if this token isn't scoped to a single project.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {
          name: { type: "string" },
          goal: { type: "string" },
          startDate: { type: "string", description: "ISO 8601 date (2026-08-03) or datetime (2026-08-03T00:00:00.000Z)" },
          endDate: { type: "string", description: "ISO 8601 date (2026-08-17) or datetime (2026-08-17T00:00:00.000Z)" },
          projectId: { type: "string" },
        },
        required: ["name"],
      }),
    },
    async (args: unknown) => {
      const { projectId: rawProjectId } = args as { projectId?: string };
      const resolved = resolveRequestedProjectId(tokenProjectId, rawProjectId);
      if (!resolved.ok) {
        return { content: [{ type: "text", text: resolved.error }], isError: true };
      }
      const { projectId } = resolved;
      const access = await loadProjectAccess(orgId, userId, projectId);
      if (!access) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      if (!access.isTenantAdmin && !(await userCanInProject(userId, orgId, projectId, "Sprint", "create"))) {
        return { content: [{ type: "text", text: "You don't have access to this." }], isError: true };
      }

      const normalizedArgs =
        args && typeof args === "object"
          ? {
              ...(args as Record<string, unknown>),
              startDate: normalizeDateOnly((args as Record<string, unknown>).startDate),
              endDate: normalizeDateOnly((args as Record<string, unknown>).endDate),
            }
          : args;
      const parsed = createSprintInput.safeParse(normalizedArgs);
      if (!parsed.success) {
        return {
          content: [{ type: "text", text: parsed.error.issues.map((i) => i.message).join(", ") }],
          isError: true,
        };
      }

      const sprint = await db.qtSprint.create({
        data: {
          projectId,
          name: parsed.data.name,
          goal: parsed.data.goal,
          startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
          endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
          createdBy: userId,
          updatedBy: userId,
        },
        select: { id: true, name: true, goal: true, status: true, startDate: true, endDate: true },
      });
      return { content: [{ type: "text", text: JSON.stringify(sprint) }] };
    },
  );

  server.registerTool(
    "add_comment",
    {
      description: "Add a comment to an issue. Pass projectId if this token isn't scoped to a single project.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {
          issueId: { type: "string" },
          body: { type: "string" },
          projectId: { type: "string" },
        },
        required: ["issueId", "body"],
      }),
    },
    async (args: unknown) => {
      const { issueId, projectId: rawProjectId } = args as { issueId: string; projectId?: string };
      const resolved = resolveRequestedProjectId(tokenProjectId, rawProjectId);
      if (!resolved.ok) {
        return { content: [{ type: "text", text: resolved.error }], isError: true };
      }
      const { projectId } = resolved;
      const access = await loadProjectAccess(orgId, userId, projectId);
      if (!access) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      const issue = await db.qtIssue.findFirst({
        where: { id: issueId, orgId, projectId, isDeleted: false },
        select: { id: true },
      });
      if (!issue) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      if (
        !access.isTenantAdmin &&
        !(await userCanInProject(userId, orgId, projectId, "IssueComment", "create"))
      ) {
        return { content: [{ type: "text", text: "You don't have access to this." }], isError: true };
      }

      const parsed = createCommentSchema.safeParse(args);
      if (!parsed.success) {
        return {
          content: [{ type: "text", text: parsed.error.issues.map((i) => i.message).join(", ") }],
          isError: true,
        };
      }

      const created = await db.qtIssueComment.create({
        data: { orgId, projectId, issueId: issue.id, userId, body: parsed.data.body, actorType },
        select: { id: true, userId: true, body: true, createdAt: true, editedAt: true, actorType: true },
      });
      const author = await db.user.findUnique({
        where: { id: userId },
        select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
      });
      return { content: [{ type: "text", text: JSON.stringify({ ...created, user: author }) }] };
    },
  );

  server.registerTool(
    "add_worklog",
    {
      description:
        'Log time spent on an issue into Timesheets. timeSpent accepts a duration string ("2h 30m", "45m", "1d") or a raw number of seconds; started defaults to now. Pass projectId if this token isn\'t scoped to a single project.',
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {
          issueId: { type: "string" },
          timeSpent: { oneOf: [{ type: "string" }, { type: "number" }] },
          started: { type: "string" },
          comment: { type: "string" },
          authorId: { type: "string" },
          projectId: { type: "string" },
        },
        required: ["issueId", "timeSpent"],
      }),
    },
    async (args: unknown) => {
      const { issueId, timeSpent, started, comment, authorId, projectId: rawProjectId } = args as {
        issueId: string;
        timeSpent: string | number;
        started?: string;
        comment?: string;
        authorId?: string;
        projectId?: string;
      };
      const resolved = resolveRequestedProjectId(tokenProjectId, rawProjectId);
      if (!resolved.ok) {
        return { content: [{ type: "text", text: resolved.error }], isError: true };
      }
      const { projectId } = resolved;
      const access = await loadProjectAccess(orgId, userId, projectId);
      if (!access) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      const issue = await db.qtIssue.findFirst({
        where: { id: issueId, orgId, projectId, isDeleted: false },
        select: { id: true, parentId: true },
      });
      if (!issue) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      if (!access.isTenantAdmin && !(await userCanInProject(userId, orgId, projectId, "Timesheet", "create"))) {
        return { content: [{ type: "text", text: "You don't have access to this." }], isError: true };
      }

      let authorUserId = userId;
      if (authorId && authorId !== userId) {
        if (!access.isTenantAdmin) {
          return {
            content: [{ type: "text", text: "You don't have access to log time on behalf of another user." }],
            isError: true,
          };
        }
        const authorMember = await db.qtProjectMember.findFirst({
          where: { projectId, userId: authorId, isDeleted: false },
          select: { id: true },
        });
        if (!authorMember) {
          return { content: [{ type: "text", text: "authorId is not a member of this project." }], isError: true };
        }
        authorUserId = authorId;
      }

      const seconds = parseWorklogTimeSpent(timeSpent);
      if (seconds === null) {
        return {
          content: [
            {
              type: "text",
              text: 'timeSpent must be a duration like "2h 30m", "45m", "1d", or a non-negative number of seconds.',
            },
          ],
          isError: true,
        };
      }

      const parsed = createTimesheetSchema.safeParse({
        issueId,
        entryDate: started ?? new Date().toISOString(),
        hours: seconds / 3600,
        description: comment,
      });
      if (!parsed.success) {
        return {
          content: [{ type: "text", text: parsed.error.issues.map((i) => i.message).join(", ") }],
          isError: true,
        };
      }

      let entry;
      try {
        entry = await createTimesheetEntry({
          orgId,
          userId: authorUserId,
          projectId,
          issueId: issue.id,
          parentIssueId: issue.parentId,
          entryDate: new Date(parsed.data.entryDate),
          hours: parsed.data.hours,
          description: parsed.data.description,
          createdBy: userId,
        });
      } catch (err) {
        if (err instanceof TimesheetFutureDateError) {
          return { content: [{ type: "text", text: err.message }], isError: true };
        }
        throw err;
      }

      const author = await db.user.findUnique({
        where: { id: authorUserId },
        select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              id: entry.id,
              issueId: entry.issueId,
              author,
              timeSpentSeconds: Math.round(entry.hours * 3600),
              started: entry.entryDate,
              comment: entry.description ?? null,
            }),
          },
        ],
      };
    },
  );

  server.registerTool(
    "list_worklogs",
    {
      description:
        "List an issue's worklog entries, chronologically. Pass projectId if this token isn't scoped to a single project.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: { issueId: { type: "string" }, projectId: { type: "string" } },
        required: ["issueId"],
      }),
    },
    async (args: unknown) => {
      const { issueId, projectId: rawProjectId } = args as { issueId: string; projectId?: string };
      const resolved = resolveRequestedProjectId(tokenProjectId, rawProjectId);
      if (!resolved.ok) {
        return { content: [{ type: "text", text: resolved.error }], isError: true };
      }
      const { projectId } = resolved;
      const access = await loadProjectAccess(orgId, userId, projectId);
      if (!access) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      const issue = await db.qtIssue.findFirst({
        where: { id: issueId, orgId, projectId, isDeleted: false },
        select: { id: true },
      });
      if (!issue) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      const worklogs = await listWorklogsForIssue({ orgId, projectId, issueId: issue.id });
      return { content: [{ type: "text", text: JSON.stringify({ worklogs }) }] };
    },
  );

  server.registerTool(
    "complete_sprint",
    {
      description:
        "Complete an ACTIVE sprint and move its open issues to the backlog. Pass projectId if this token isn't scoped to a single project.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: { sprintId: { type: "string" }, projectId: { type: "string" } },
        required: ["sprintId"],
      }),
    },
    async (args: unknown) => {
      const { sprintId, projectId: rawProjectId } = args as { sprintId: string; projectId?: string };
      const resolved = resolveRequestedProjectId(tokenProjectId, rawProjectId);
      if (!resolved.ok) {
        return { content: [{ type: "text", text: resolved.error }], isError: true };
      }
      const { projectId } = resolved;
      const access = await loadProjectAccess(orgId, userId, projectId);
      if (!access) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      const sprint = await db.qtSprint.findFirst({
        where: { id: sprintId, projectId, isDeleted: false },
        select: { id: true, status: true },
      });
      if (!sprint) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      if (sprint.status !== "ACTIVE") {
        return {
          content: [{ type: "text", text: `Sprint is ${sprint.status}, must be ACTIVE` }],
          isError: true,
        };
      }
      if (!access.isTenantAdmin && !(await userCanInProject(userId, orgId, projectId, "Sprint", "update"))) {
        return { content: [{ type: "text", text: "You don't have access to this." }], isError: true };
      }

      const completedAt = new Date();
      const updated = await db.$transaction(async (tx) => {
        // Freeze the velocity snapshot BEFORE moving unfinished issues out —
        // once they're moved, the committed scope can't be reconstructed.
        // See app/api/sprints/[id]/complete/route.ts (the REST equivalent).
        await recordSprintVelocity(tx, { orgId, projectId, sprintId, completedAt });

        const doneStatuses = await tx.qtIssueStatus.findMany({
          where: { projectId, category: "DONE", isDeleted: false },
          select: { id: true },
        });
        const doneIds = doneStatuses.map((s) => s.id);

        await tx.qtIssue.updateMany({
          where: {
            sprintId,
            isDeleted: false,
            ...(doneIds.length ? { statusId: { notIn: doneIds } } : {}),
          },
          data: { sprintId: null, updatedBy: userId },
        });

        return tx.qtSprint.update({
          where: { id: sprintId },
          data: { status: "COMPLETED", completedAt, updatedBy: userId },
          select: { id: true, name: true, status: true, completedAt: true },
        });
      });
      return { content: [{ type: "text", text: JSON.stringify(updated) }] };
    },
  );

  server.registerTool(
    "search_issues",
    {
      description:
        'Search issues by common filters, or pass `query` for advanced QQL (QuikTrack Query Language) — e.g. \'status IN ("To Do","In Progress") AND assignee = "acct:123" AND updated >= -7d ORDER BY updated DESC\'. Fields: project, type, status, priority, assignee, reporter, sprint, epic, labels, created, updated, text. Operators: =, !=, IN, NOT IN, >, <, >=, <=, ~ (contains), AND/OR, parens. When `query` is given, pagination is limit+offset (not cursor) since a custom ORDER BY is incompatible with cursor pagination. Pass projectId if this token isn\'t scoped to a single project.',
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {
          type: { type: "string" },
          statusId: { type: "string" },
          statusCategory: { type: "string", enum: ["BACKLOG", "IN_PROGRESS", "DONE"] },
          sprintId: { type: ["string", "null"] },
          assigneeId: { type: ["string", "null"] },
          priority: { type: "string" },
          parentId: { type: ["string", "null"] },
          epicId: { type: ["string", "null"] },
          search: { type: "string" },
          query: { type: "string" },
          limit: { type: "number" },
          offset: { type: "number" },
          cursor: { type: "string" },
          projectId: { type: "string" },
        },
      }),
    },
    async (args: unknown) => {
      const a = args as {
        type?: string;
        statusId?: string;
        statusCategory?: "BACKLOG" | "IN_PROGRESS" | "DONE";
        sprintId?: string | null;
        assigneeId?: string | null;
        priority?: string;
        parentId?: string | null;
        epicId?: string | null;
        search?: string;
        query?: string;
        limit?: number;
        offset?: number;
        cursor?: string;
        projectId?: string;
      };
      const resolved = resolveRequestedProjectId(tokenProjectId, a.projectId);
      if (!resolved.ok) {
        return { content: [{ type: "text", text: resolved.error }], isError: true };
      }
      const { projectId } = resolved;
      const access = await loadProjectAccess(orgId, userId, projectId);
      if (!access) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }

      const limit = a.limit && a.limit > 0 ? Math.min(100, a.limit) : 25;
      const simpleWhere = {
        orgId,
        projectId,
        isDeleted: false,
        ...(a.type ? { type: a.type } : {}),
        ...(a.statusId ? { statusId: a.statusId } : {}),
        ...(a.statusCategory ? { status: { category: a.statusCategory } } : {}),
        ...(a.sprintId === undefined ? {} : { sprintId: a.sprintId }),
        ...(a.assigneeId === undefined ? {} : { assigneeId: a.assigneeId }),
        ...(a.priority ? { priority: a.priority } : {}),
        ...(a.parentId === undefined ? {} : { parentId: a.parentId }),
        ...(a.epicId === undefined ? {} : { epicId: a.epicId }),
        ...(a.search
          ? {
              OR: [
                { title: { contains: a.search, mode: "insensitive" as const } },
                { description: { contains: a.search, mode: "insensitive" as const } },
                { key: { contains: a.search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      };
      const select = {
        id: true,
        key: true,
        title: true,
        type: true,
        priority: true,
        statusId: true,
        assigneeId: true,
        sprintId: true,
        parentId: true,
        epicId: true,
      } as const;

      // Legacy simple params keep their own where clause untouched (QUIKTR-117
      // ANDs a QQL fragment on top rather than re-encoding them into QQL, so
      // existing callers get byte-identical behavior).
      if (!a.query) {
        const total = await db.qtIssue.count({ where: simpleWhere as Prisma.QtIssueWhereInput });
        const issues = await db.qtIssue.findMany({
          where: simpleWhere as Prisma.QtIssueWhereInput,
          orderBy: [{ orderInColumn: "asc" }, { createdAt: "desc" }, { id: "asc" }],
          take: limit + 1,
          ...(a.cursor ? { cursor: { id: a.cursor }, skip: 1 } : {}),
          select,
        });
        let nextCursor: string | null = null;
        let pageIssues = issues;
        if (issues.length > limit) {
          pageIssues = issues.slice(0, limit);
          nextCursor = pageIssues[pageIssues.length - 1]?.id ?? null;
        }
        return { content: [{ type: "text", text: JSON.stringify({ issues: pageIssues, nextCursor, total }) }] };
      }

      let where: Prisma.QtIssueWhereInput;
      let orderBy: Prisma.QtIssueOrderByWithRelationInput[];
      try {
        const parsedQuery = parseQql(a.query);
        const qqlWhere = parsedQuery.where ? await buildQqlWhere(parsedQuery.where, { orgId, projectId, userId }) : {};
        // buildQqlWhere assembles a dynamically-shaped JSON where fragment
        // (see qql/buildWhere.ts) — cast once here, at the boundary, rather
        // than typing the whole recursive builder against Prisma's types.
        where = { AND: [simpleWhere, qqlWhere as unknown as Prisma.QtIssueWhereInput] };
        orderBy = parsedQuery.orderBy
          ? [buildQqlOrderBy(parsedQuery.orderBy) as unknown as Prisma.QtIssueOrderByWithRelationInput, { id: "asc" }]
          : [{ orderInColumn: "asc" }, { createdAt: "desc" }, { id: "asc" }];
      } catch (error) {
        if (error instanceof QqlParseError) {
          return {
            content: [{ type: "text", text: `Parse error at position ${error.position}: ${error.message}` }],
            isError: true,
          };
        }
        throw error;
      }

      const offset = a.offset && a.offset > 0 ? a.offset : 0;
      const [total, issues] = await Promise.all([
        db.qtIssue.count({ where }),
        db.qtIssue.findMany({ where, orderBy, skip: offset, take: limit, select }),
      ]);

      return { content: [{ type: "text", text: JSON.stringify({ issues, total, offset, limit }) }] };
    },
  );

  server.registerTool(
    "quiktrack_update_issue",
    {
      description:
        "Update an issue's fields (title, description, type, priority, status, assignee, parent, epic, sprint, dates, eta, storyPoints). Pass projectId if this token isn't scoped to a single project.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {
          issueId: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          type: { type: "string", enum: ["EPIC", "TASK", "STORY", "BUG", "SUBTASK"] },
          statusId: { type: "string" },
          priority: { type: "string", enum: ["LOWEST", "LOW", "MEDIUM", "HIGH", "HIGHEST"] },
          parentId: { type: ["string", "null"] },
          epicId: { type: ["string", "null"] },
          sprintId: { type: ["string", "null"] },
          assigneeId: { type: ["string", "null"] },
          startDate: { type: ["string", "null"] },
          dueDate: { type: ["string", "null"] },
          eta: { type: "number" },
          storyPoints: { type: "number" },
          customFields: { type: "object" },
          projectId: { type: "string" },
        },
        required: ["issueId"],
      }),
    },
    async (args: unknown) => {
      const { issueId, projectId: rawProjectId, ...rest } = args as {
        issueId: string;
        projectId?: string;
        [key: string]: unknown;
      };
      const resolved = resolveRequestedProjectId(tokenProjectId, rawProjectId);
      if (!resolved.ok) {
        return { content: [{ type: "text", text: resolved.error }], isError: true };
      }
      const { projectId } = resolved;
      const access = await loadProjectAccess(orgId, userId, projectId);
      if (!access) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      const issue = await db.qtIssue.findFirst({
        where: { id: issueId, orgId, projectId, isDeleted: false },
        select: { id: true, key: true, resolutionId: true, ...selectIssueHistorySnapshot },
      });
      if (!issue) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      if (!access.isTenantAdmin && !(await userCanInProject(userId, orgId, projectId, "Issue", "update"))) {
        return { content: [{ type: "text", text: "You don't have access to this." }], isError: true };
      }

      const parsed = updateIssueInput.safeParse(rest);
      if (!parsed.success) {
        return {
          content: [{ type: "text", text: parsed.error.issues.map((i) => i.message).join(", ") }],
          isError: true,
        };
      }

      const { customFields, ...issueFields } = parsed.data as typeof parsed.data & {
        customFields?: Record<string, FieldValue>;
      };
      if (customFields) {
        // validateIssueValues/writeIssueValues silently ignore keys that
        // don't match an active field in scope (intentional for REST callers
        // sending a generic form payload) — but an MCP-calling agent has no
        // form, only the ids list_custom_fields just gave it, so a bad id
        // here is almost always a mistake it needs to know about and fix.
        const activeFields = await getActiveFieldsForProject(orgId, projectId);
        const validFieldIds = new Set(activeFields.map((f) => f.id));
        const unknownIds = Object.keys(customFields).filter((id) => !validFieldIds.has(id));
        if (unknownIds.length > 0) {
          return {
            content: [{
              type: "text",
              text: `Unknown custom field id(s): ${unknownIds.join(", ")}. Call list_custom_fields to get valid ids for this project.`,
            }],
            isError: true,
          };
        }

        const valid = await validateIssueValues({
          orgId,
          projectId,
          issueId: issue.id,
          values: customFields,
        });
        if (!valid.ok) {
          return { content: [{ type: "text", text: valid.errors.join(", ") }], isError: true };
        }
      }

      const { allowed, rejected } = await filterUpdatePayload(
        userId,
        orgId,
        projectId,
        "Issue",
        issueFields as Record<string, unknown>,
      );
      if (rejected.length > 0 && Object.keys(allowed).length === 0) {
        return {
          content: [{ type: "text", text: `Field(s) not editable for your role: ${rejected.join(", ")}` }],
          isError: true,
        };
      }

      const allowedFields = allowed as typeof issueFields;
      const dateValue = (key: "startDate" | "dueDate") =>
        key in allowedFields ? (allowedFields[key] ? new Date(allowedFields[key]!) : null) : undefined;

      // A statusId change must go through the workflow-transition pipeline
      // (conditions/validators/post-functions + audit log), same as the
      // issue detail panel's edit — see app/api/issues/[id]/route.ts PATCH.
      const isStatusChange = allowedFields.statusId != null && allowedFields.statusId !== issue.statusId;
      let workflowPatch: ExecuteResult["patch"] = {};
      let workflowComments: string[] = [];
      if (isStatusChange) {
        const issueSnapshot: TransitionIssueSnapshot = {
          id: issue.id,
          orgId,
          projectId,
          type: issue.type ?? "TASK",
          statusId: issue.statusId as string,
          assigneeId: issue.assigneeId ?? null,
          resolutionId: issue.resolutionId ?? null,
          priority: issue.priority ?? null,
        };
        try {
          const res = await executeTransition({
            issue: issueSnapshot,
            toStatusId: allowedFields.statusId as string,
            userId,
          });
          workflowPatch = res.patch ?? {};
          workflowComments = res.comments ?? [];
        } catch (error: unknown) {
          const mapped = await transitionErrorContent(error, { issue: issueSnapshot, userId });
          if (mapped) return mapped;
          throw error;
        }
      }

      const updated = await db.$transaction(async (tx) => {
        const issueAfter = await tx.qtIssue.update({
          where: { id: issueId },
          data: {
            ...allowedFields,
            startDate: dateValue("startDate"),
            dueDate: dateValue("dueDate"),
            ...("assigneeId" in workflowPatch ? { assigneeId: workflowPatch.assigneeId } : {}),
            ...("resolutionId" in workflowPatch ? { resolutionId: workflowPatch.resolutionId } : {}),
            ...(typeof workflowPatch.priority === "string" ? { priority: workflowPatch.priority } : {}),
            updatedBy: userId,
          },
          select: { id: true, key: true, resolutionId: true, ...selectIssueHistorySnapshot },
        });
        if (isStatusChange) {
          await tx.qtIssueTransitionLog.create({
            data: {
              orgId,
              issueId: issue.id,
              fromStatusId: issue.statusId as string,
              toStatusId: allowedFields.statusId as string,
              actorId: userId,
              actorType,
            },
          });
        }
        if (workflowComments.length > 0) {
          await tx.qtIssueComment.createMany({
            data: workflowComments.map((body) => ({
              orgId,
              projectId,
              issueId: issue.id,
              userId,
              body,
              actorType,
            })),
          });
        }
        return issueAfter;
      });
      void recordIssueChanges({ orgId, projectId, issueId: issue.id, userId, before: issue, after: updated, actorType });

      if (customFields) {
        const res = await writeIssueValues({
          orgId,
          issueId: issue.id,
          projectId,
          actorId: userId,
          values: customFields,
        });
        if (res.ok) {
          for (const c of res.changes) {
            void recordIssueEvent({
              orgId,
              projectId,
              issueId: issue.id,
              userId,
              field: c.fieldName,
              oldValue: renderCfValue(c.oldValue),
              newValue: renderCfValue(c.newValue),
              actorType,
            });
          }
        }
      }
      return { content: [{ type: "text", text: JSON.stringify(updated) }] };
    },
  );

  server.registerTool(
    "list_remote_links",
    {
      description: "List an issue's remote links (e.g. attached PRs), oldest first. Pass projectId if this token isn't scoped to a single project.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: { issueId: { type: "string" }, projectId: { type: "string" } },
        required: ["issueId"],
      }),
    },
    async (args: unknown) => {
      const { issueId, projectId: rawProjectId } = args as { issueId: string; projectId?: string };
      const resolved = resolveRequestedProjectId(tokenProjectId, rawProjectId);
      if (!resolved.ok) {
        return { content: [{ type: "text", text: resolved.error }], isError: true };
      }
      const { projectId } = resolved;
      const access = await loadProjectAccess(orgId, userId, projectId);
      if (!access) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      const issue = await db.qtIssue.findFirst({
        where: { id: issueId, orgId, projectId, isDeleted: false },
        select: { id: true },
      });
      if (!issue) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      const links = await db.qtRemoteLink.findMany({
        where: { orgId, issueId },
        orderBy: { createdAt: "asc" },
        select: { id: true, url: true, title: true, type: true, metadata: true, createdAt: true },
      });
      return { content: [{ type: "text", text: JSON.stringify(links) }] };
    },
  );

  server.registerTool(
    "add_remote_link",
    {
      description: "Attach an external URL (e.g. a PR) to an issue. Pass projectId if this token isn't scoped to a single project.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {
          issueId: { type: "string" },
          url: { type: "string" },
          title: { type: "string" },
          type: { type: "string" },
          projectId: { type: "string" },
        },
        required: ["issueId", "url", "title", "type"],
      }),
    },
    async (args: unknown) => {
      const { issueId, projectId: rawProjectId } = args as { issueId: string; projectId?: string };
      const resolved = resolveRequestedProjectId(tokenProjectId, rawProjectId);
      if (!resolved.ok) {
        return { content: [{ type: "text", text: resolved.error }], isError: true };
      }
      const { projectId } = resolved;
      const access = await loadProjectAccess(orgId, userId, projectId);
      if (!access) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      const issue = await db.qtIssue.findFirst({
        where: { id: issueId, orgId, projectId, isDeleted: false },
        select: { id: true },
      });
      if (!issue) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      if (!access.isTenantAdmin && !(await userCanInProject(userId, orgId, projectId, "Issue", "update"))) {
        return { content: [{ type: "text", text: "You don't have access to this." }], isError: true };
      }

      const parsed = addRemoteLinkInput.safeParse(args);
      if (!parsed.success) {
        return {
          content: [{ type: "text", text: parsed.error.issues.map((i) => i.message).join(", ") }],
          isError: true,
        };
      }

      const link = await db.qtRemoteLink.create({
        data: {
          orgId,
          projectId,
          issueId: issue.id,
          url: parsed.data.url,
          title: parsed.data.title,
          type: parsed.data.type,
        },
        select: { id: true, url: true, title: true, type: true, metadata: true, createdAt: true },
      });
      return { content: [{ type: "text", text: JSON.stringify(link) }] };
    },
  );

  server.registerTool(
    "link_issues",
    {
      description:
        'Create a directional link between two issues (e.g. "blocks"/"is blocked by", "relates to", "duplicates"/"is duplicated by"). linkType must be one of list_link_types\' `type` values — for "blocks", outwardIssueId blocks inwardIssueId. Creating the same link twice is a no-op. Pass projectId if this token isn\'t scoped to a single project.',
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {
          inwardIssueId: { type: "string" },
          outwardIssueId: { type: "string" },
          linkType: { type: "string" },
          projectId: { type: "string" },
        },
        required: ["inwardIssueId", "outwardIssueId", "linkType"],
      }),
    },
    async (args: unknown) => {
      const {
        inwardIssueId,
        outwardIssueId,
        linkType,
        projectId: rawProjectId,
      } = args as { inwardIssueId: string; outwardIssueId: string; linkType: string; projectId?: string };
      const resolved = resolveRequestedProjectId(tokenProjectId, rawProjectId);
      if (!resolved.ok) {
        return { content: [{ type: "text", text: resolved.error }], isError: true };
      }
      const { projectId } = resolved;
      const access = await loadProjectAccess(orgId, userId, projectId);
      if (!access) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      const outwardIssue = await db.qtIssue.findFirst({
        where: { id: outwardIssueId, orgId, projectId, isDeleted: false },
        select: { id: true, projectId: true },
      });
      if (!outwardIssue) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      if (!access.isTenantAdmin && !(await userCanInProject(userId, orgId, projectId, "Issue", "update"))) {
        return { content: [{ type: "text", text: "You don't have access to this." }], isError: true };
      }

      if (inwardIssueId === outwardIssueId) {
        return { content: [{ type: "text", text: "Cannot link an issue to itself." }], isError: true };
      }
      const linkTypeDef = ISSUE_LINK_TYPES.find((t) => t.type === linkType);
      if (!linkTypeDef) {
        return {
          content: [
            {
              type: "text",
              text: `Unknown linkType "${linkType}". Valid types: ${ISSUE_LINK_TYPES.map((t) => t.type).join(", ")}.`,
            },
          ],
          isError: true,
        };
      }
      // Cross-project links are allowed (mirrors app/api/issues/[id]/links) —
      // only the outward issue's project gates access to this call.
      const inwardIssue = await db.qtIssue.findFirst({
        where: { id: inwardIssueId, orgId, isDeleted: false },
        select: { id: true },
      });
      if (!inwardIssue) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }

      const existing = await db.qtIssueLink.findFirst({
        where: { sourceIssueId: outwardIssue.id, targetIssueId: inwardIssue.id, type: linkTypeDef.type },
        select: { id: true },
      });
      const link =
        existing ??
        (await db.qtIssueLink.create({
          data: {
            orgId,
            projectId: outwardIssue.projectId,
            sourceIssueId: outwardIssue.id,
            targetIssueId: inwardIssue.id,
            type: linkTypeDef.type,
            createdBy: userId,
          },
          select: { id: true },
        }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              id: link.id,
              linkType: linkTypeDef.type,
              outwardIssueId: outwardIssue.id,
              inwardIssueId: inwardIssue.id,
              outwardRelationship: linkTypeDef.outward,
              inwardRelationship: linkTypeDef.inward,
            }),
          },
        ],
      };
    },
  );

  server.registerTool(
    "list_issue_links",
    {
      description:
        "List an issue's internal links in both directions, each with the related issue's key/title/status and a human-readable relationship name. Pass projectId if this token isn't scoped to a single project.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: { issueId: { type: "string" }, projectId: { type: "string" } },
        required: ["issueId"],
      }),
    },
    async (args: unknown) => {
      const { issueId, projectId: rawProjectId } = args as { issueId: string; projectId?: string };
      const resolved = resolveRequestedProjectId(tokenProjectId, rawProjectId);
      if (!resolved.ok) {
        return { content: [{ type: "text", text: resolved.error }], isError: true };
      }
      const { projectId } = resolved;
      const access = await loadProjectAccess(orgId, userId, projectId);
      if (!access) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      const issue = await db.qtIssue.findFirst({
        where: { id: issueId, orgId, projectId, isDeleted: false },
        select: { id: true },
      });
      if (!issue) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      const links = await loadIssueLinks(orgId, issue.id);
      return { content: [{ type: "text", text: JSON.stringify(links) }] };
    },
  );

  return server;
});
