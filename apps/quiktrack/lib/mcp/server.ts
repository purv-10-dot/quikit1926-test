import { createMcpHandler, fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import { db } from "@/lib/db";
import { loadProjectAccess } from "@/lib/api/withProjectAccess";
import { userCanInProject } from "@/lib/api/permissions";
import { createIssueSchema, moveIssueSchema, updateIssueSchema } from "@/lib/validation/issue";
import { createSprintSchema } from "@/lib/validation/sprint";
import { getDefaultStatusId } from "@/lib/services/projectDefaults";
import { recordIssueChanges, recordIssueEvent, selectIssueHistorySnapshot } from "@/lib/services/issueHistory";
import { createCommentSchema } from "@/lib/validation/comment";
import { addRemoteLinkSchema as addRemoteLinkInput } from "@/lib/validation/remoteLink";
import { renderCfValue } from "@/lib/customFields/render";
import { filterUpdatePayload } from "@/lib/api/fieldLevels";
import { getActiveFieldsForProject, validateIssueValues, writeIssueValues } from "@/lib/services/customFieldValues";
import type { FieldValue } from "@/lib/customFields/registry";
import {
  executeTransition,
  TransitionNotAllowedError,
  ConditionsFailedError,
  ValidationFailedError,
  type ExecuteResult,
} from "@/lib/services/workflow";
import { recordSprintVelocity } from "@/lib/reports/sprint-snapshot";

const createIssueInput = createIssueSchema.omit({ projectId: true });
const createSprintInput = createSprintSchema.omit({ projectId: true });
const updateIssueInput = updateIssueSchema;

// createSprintSchema requires a full ISO 8601 datetime, but callers (LLMs in
// particular) naturally send a bare date like "2026-08-03". Widen just the
// MCP entrypoint to accept that shorthand rather than loosen the shared
// schema also used by the REST route.
function normalizeDateOnly(value: unknown): unknown {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
}

/** Maps a workflow-transition error to an MCP tool error result, or `null`
 *  if `error` isn't one of the three transition errors. */
function transitionErrorContent(error: unknown): { content: [{ type: "text"; text: string }]; isError: true } | null {
  if (error instanceof TransitionNotAllowedError) {
    return { content: [{ type: "text", text: error.message }], isError: true };
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

export interface McpAuthExtra {
  orgId: string;
  projectId: string;
  userId: string;
  /** Always "agent" — every MCP caller is a PAT-authenticated tool, never a human session. */
  actorType: "user" | "agent";
}

export const mcpHandler = createMcpHandler(({ authInfo }) => {
  const { orgId, projectId, userId, actorType } = authInfo?.extra as unknown as McpAuthExtra;
  const server = new McpServer({ name: "quiktrack", version: "1.0.0" });

  server.registerTool(
    "get_issue",
    {
      description: "Get a QuikTrack issue by id, scoped to the PAT's project",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: { issueId: { type: "string" } },
        required: ["issueId"],
      }),
    },
    async (args: unknown) => {
      const { issueId } = args as { issueId: string };
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
      return { content: [{ type: "text", text: JSON.stringify(issue) }] };
    },
  );

  server.registerTool(
    "get_project",
    {
      description: "Get the QuikTrack project the PAT is scoped to",
      inputSchema: fromJsonSchema({ type: "object", properties: {} }),
    },
    async () => {
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
        "List the custom field definitions available on the PAT's scoped project. Use a field's `id` as the key in quiktrack_update_issue's customFields.",
      inputSchema: fromJsonSchema({ type: "object", properties: {} }),
    },
    async () => {
      const access = await loadProjectAccess(orgId, userId, projectId);
      if (!access) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }
      const fields = await getActiveFieldsForProject(orgId, projectId);
      return { content: [{ type: "text", text: JSON.stringify(fields) }] };
    },
  );

  server.registerTool(
    "get_member",
    {
      description: "Get a project member's profile by userId, scoped to the PAT's project",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: { userId: { type: "string" } },
        required: ["userId"],
      }),
    },
    async (args: unknown) => {
      const { userId: targetUserId } = args as { userId: string };
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
      description: "Find project members to assign an issue to, scoped to the PAT's project",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: { query: { type: "string" } },
      }),
    },
    async (args: unknown) => {
      const { query } = args as { query?: string };
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
      description: "Create a QuikTrack issue in the PAT's scoped project",
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
        },
        required: ["title"],
      }),
    },
    async (args: unknown) => {
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
      description: "List an issue's comments, oldest first, scoped to the PAT's project",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: { issueId: { type: "string" } },
        required: ["issueId"],
      }),
    },
    async (args: unknown) => {
      const { issueId } = args as { issueId: string };
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
      description: "Transition a PLANNING sprint to ACTIVE, scoped to the PAT's project",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: { sprintId: { type: "string" } },
        required: ["sprintId"],
      }),
    },
    async (args: unknown) => {
      const { sprintId } = args as { sprintId: string };
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
    "move_issue",
    {
      description: "Transition an issue between status/sprint/parent/column position, scoped to the PAT's project",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {
          issueId: { type: "string" },
          statusId: { type: "string" },
          sprintId: { type: ["string", "null"] },
          parentId: { type: ["string", "null"] },
          orderInColumn: { type: "number" },
        },
        required: ["issueId"],
      }),
    },
    async (args: unknown) => {
      const { issueId, ...rest } = args as { issueId: string; [key: string]: unknown };
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
        try {
          const res = await executeTransition({
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
            toStatusId: parsed.data.statusId as string,
            userId,
          });
          workflowPatch = res.patch ?? {};
          workflowComments = res.comments ?? [];
        } catch (error: unknown) {
          const mapped = transitionErrorContent(error);
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
      description: "Create a sprint in the PAT's scoped project",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {
          name: { type: "string" },
          goal: { type: "string" },
          startDate: { type: "string", description: "ISO 8601 date (2026-08-03) or datetime (2026-08-03T00:00:00.000Z)" },
          endDate: { type: "string", description: "ISO 8601 date (2026-08-17) or datetime (2026-08-17T00:00:00.000Z)" },
        },
        required: ["name"],
      }),
    },
    async (args: unknown) => {
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
      description: "Add a comment to an issue, scoped to the PAT's project",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {
          issueId: { type: "string" },
          body: { type: "string" },
        },
        required: ["issueId", "body"],
      }),
    },
    async (args: unknown) => {
      const { issueId } = args as { issueId: string };
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
    "complete_sprint",
    {
      description:
        "Complete an ACTIVE sprint and move its open issues to the backlog, scoped to the PAT's project",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: { sprintId: { type: "string" } },
        required: ["sprintId"],
      }),
    },
    async (args: unknown) => {
      const { sprintId } = args as { sprintId: string };
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
      description: "Search issues by common filters, scoped to the PAT's project",
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
          limit: { type: "number" },
          cursor: { type: "string" },
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
        limit?: number;
        cursor?: string;
      };
      const access = await loadProjectAccess(orgId, userId, projectId);
      if (!access) {
        return { content: [{ type: "text", text: "Not found" }], isError: true };
      }

      const limit = a.limit && a.limit > 0 ? Math.min(100, a.limit) : 25;
      const where = {
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

      const issues = await db.qtIssue.findMany({
        where,
        orderBy: [{ orderInColumn: "asc" }, { createdAt: "desc" }, { id: "asc" }],
        take: limit + 1,
        ...(a.cursor ? { cursor: { id: a.cursor }, skip: 1 } : {}),
        select: {
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
        },
      });

      let nextCursor: string | null = null;
      let pageIssues = issues;
      if (issues.length > limit) {
        pageIssues = issues.slice(0, limit);
        nextCursor = pageIssues[pageIssues.length - 1]?.id ?? null;
      }

      return { content: [{ type: "text", text: JSON.stringify({ issues: pageIssues, nextCursor }) }] };
    },
  );

  server.registerTool(
    "quiktrack_update_issue",
    {
      description:
        "Update an issue's fields (title, description, type, priority, status, assignee, parent, epic, sprint, dates, eta, storyPoints), scoped to the PAT's project",
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
        },
        required: ["issueId"],
      }),
    },
    async (args: unknown) => {
      const { issueId, ...rest } = args as { issueId: string; [key: string]: unknown };
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
        try {
          const res = await executeTransition({
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
            toStatusId: allowedFields.statusId as string,
            userId,
          });
          workflowPatch = res.patch ?? {};
          workflowComments = res.comments ?? [];
        } catch (error: unknown) {
          const mapped = transitionErrorContent(error);
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
      description: "List an issue's remote links (e.g. attached PRs), oldest first, scoped to the PAT's project",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: { issueId: { type: "string" } },
        required: ["issueId"],
      }),
    },
    async (args: unknown) => {
      const { issueId } = args as { issueId: string };
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
      description: "Attach an external URL (e.g. a PR) to an issue, scoped to the PAT's project",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {
          issueId: { type: "string" },
          url: { type: "string" },
          title: { type: "string" },
          type: { type: "string" },
        },
        required: ["issueId", "url", "title", "type"],
      }),
    },
    async (args: unknown) => {
      const { issueId } = args as { issueId: string };
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

  return server;
});
