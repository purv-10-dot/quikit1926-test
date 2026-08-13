/**
 * Declarative operations catalog for GET /api/internal/manifest — the AI
 * Runtime's dynamic capability discovery endpoint. See the manifest/summary
 * contract doc from Suyash (AI Runtime), §2.
 *
 * Each Operation maps 1:1 onto the runtime's ToolDefinition contract. Kept
 * separate from the route file so the route stays a thin auth+serve wrapper.
 *
 * `requiredPermission` uses the registry's `Resource:action` form verbatim
 * (see lib/api/permissionsRegistry.ts) — never the launcher's dotted
 * manifest.ts strings (those are a different, display-only vocabulary).
 * `null` means the operation is gated by project membership only today; no
 * registry leaf exists to cite (confirmed against permissionsRegistry.ts —
 * Issue/Sprint have no `view` action, IssueComment has no view/update/delete
 * leaf at all, links have no permission leaf). Declaring null is honest
 * about that, per §2.4 — nothing here invents an unenforced grant string.
 *
 * riskClass classification rule (§2.3): "creates new" → soft_write,
 * "mutates/deletes existing" → medium_write/high_risk, reads → read.
 */

export type RiskClass = "read" | "draft" | "soft_write" | "medium_write" | "high_risk";

export interface ManifestEntity {
  type: string;
  displayName: string;
  isSearchable: boolean;
  detailEndpoint: string;
  summaryEndpoint: string | null;
}

export interface ManifestOperation {
  name: string;
  description: string;
  entity: string;
  http: { method: "GET" | "POST" | "PATCH" | "DELETE"; pathTemplate: string };
  riskClass: RiskClass;
  requiredPermission: string | null;
  isSummary: boolean;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

export const MANIFEST_ENTITIES: ManifestEntity[] = [
  {
    type: "issue",
    displayName: "Issue",
    isSearchable: true,
    detailEndpoint: "/api/issues/{id}",
    summaryEndpoint: "/api/issues/{id}/summary",
  },
  {
    type: "sprint",
    displayName: "Sprint",
    isSearchable: true,
    detailEndpoint: "/api/sprints/{id}",
    summaryEndpoint: "/api/sprints/{id}/summary",
  },
  {
    type: "project",
    displayName: "Project",
    isSearchable: true,
    detailEndpoint: "/api/projects/{id}",
    summaryEndpoint: "/api/projects/{id}/summary",
  },
];

const idParam = (description: string) => ({
  type: "object" as const,
  required: ["id"],
  properties: { id: { type: "string", description } },
});

export const MANIFEST_OPERATIONS: ManifestOperation[] = [
  // ── Issue ────────────────────────────────────────────────────────────────
  {
    name: "summarize_issue",
    description: "Compact issue summary: status, assignee, dates, progress, recent activity.",
    entity: "issue",
    http: { method: "GET", pathTemplate: "/api/issues/{id}/summary" },
    riskClass: "read",
    requiredPermission: null,
    isSummary: true,
    inputSchema: idParam("QtIssue id"),
    outputSchema: { type: "object", description: "See summary contract §3.2" },
  },
  {
    name: "get_issue",
    description: "Full issue detail (subtasks, time logs, custom fields, permissions).",
    entity: "issue",
    http: { method: "GET", pathTemplate: "/api/issues/{id}" },
    riskClass: "read",
    requiredPermission: null,
    isSummary: false,
    inputSchema: idParam("QtIssue id"),
    outputSchema: { type: "object", description: "{data: QtIssue & detail joins}" },
  },
  {
    name: "list_issues",
    description: "List/filter issues in a project (board/backlog/list views).",
    entity: "issue",
    http: { method: "GET", pathTemplate: "/api/issues" },
    riskClass: "read",
    requiredPermission: null,
    isSummary: false,
    inputSchema: {
      type: "object",
      required: ["projectId"],
      properties: {
        projectId: { type: "string", description: "QtProject id or projectKey" },
        statusCategory: { enum: ["BACKLOG", "IN_PROGRESS", "DONE"] },
        assigneeId: { type: "string" },
        sprintId: { type: "string" },
        limit: { type: "integer", maximum: 100 },
      },
    },
    outputSchema: { type: "object", description: "{data: QtIssue[], nextCursor, total}" },
  },
  {
    name: "create_issue",
    description: "Create an issue in a project.",
    entity: "issue",
    http: { method: "POST", pathTemplate: "/api/issues" },
    riskClass: "soft_write",
    requiredPermission: "Issue:create",
    isSummary: false,
    inputSchema: {
      type: "object",
      required: ["projectId", "title"],
      properties: {
        projectId: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        type: { enum: ["TASK", "BUG", "EPIC", "SUBTASK"] },
        statusId: { type: "string" },
        priority: { enum: ["LOW", "MEDIUM", "HIGH", "URGENT"] },
        assigneeId: { type: "string" },
        sprintId: { type: "string" },
      },
    },
    outputSchema: { type: "object", description: "{data: QtIssue}" },
  },
  {
    name: "update_issue",
    description: "Update issue fields; drives the workflow transition pipeline when statusId changes.",
    entity: "issue",
    http: { method: "PATCH", pathTemplate: "/api/issues/{id}" },
    riskClass: "medium_write",
    requiredPermission: "Issue:update",
    isSummary: false,
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        statusId: { type: "string" },
        assigneeId: { type: "string" },
        priority: { enum: ["LOW", "MEDIUM", "HIGH", "URGENT"] },
        dueDate: { type: "string", format: "date-time" },
      },
    },
    outputSchema: { type: "object", description: "{data: QtIssue}" },
  },
  {
    name: "move_issue",
    description: "Board/backlog drag-move: status/sprint/parent/order change via the workflow pipeline.",
    entity: "issue",
    http: { method: "PATCH", pathTemplate: "/api/issues/{id}/move" },
    riskClass: "medium_write",
    requiredPermission: "Issue:update",
    isSummary: false,
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        statusId: { type: "string" },
        sprintId: { type: "string", nullable: true },
        parentId: { type: "string", nullable: true },
        orderInColumn: { type: "integer" },
      },
    },
    outputSchema: { type: "object", description: "{data: QtIssue}" },
  },
  {
    name: "delete_issue",
    description: "Soft-delete an issue; cascades or detaches subtasks per subtaskMode.",
    entity: "issue",
    http: { method: "DELETE", pathTemplate: "/api/issues/{id}" },
    riskClass: "high_risk",
    requiredPermission: "Issue:delete",
    isSummary: false,
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" }, subtaskMode: { enum: ["cascade", "detach"] } },
    },
    outputSchema: { type: "object", description: "{success: true}" },
  },
  // ── IssueComment ─────────────────────────────────────────────────────────
  {
    name: "list_issue_comments",
    description: "List all non-deleted comments on an issue, oldest first.",
    entity: "issue",
    http: { method: "GET", pathTemplate: "/api/issues/{id}/comments" },
    riskClass: "read",
    requiredPermission: null,
    isSummary: false,
    inputSchema: idParam("QtIssue id"),
    outputSchema: { type: "object", description: "{data: QtIssueComment[]}" },
  },
  {
    name: "add_issue_comment",
    description: "Add a comment to an issue.",
    entity: "issue",
    http: { method: "POST", pathTemplate: "/api/issues/{id}/comments" },
    riskClass: "soft_write",
    requiredPermission: "IssueComment:create",
    isSummary: false,
    inputSchema: {
      type: "object",
      required: ["id", "body"],
      properties: { id: { type: "string" }, body: { type: "string", maxLength: 20000 } },
    },
    outputSchema: { type: "object", description: "{data: QtIssueComment}" },
  },
  // ── Issue links ──────────────────────────────────────────────────────────
  {
    name: "link_issues",
    description: "Create a \"relates to\" link between two issues.",
    entity: "issue",
    http: { method: "POST", pathTemplate: "/api/issues/{id}/links" },
    riskClass: "soft_write",
    // No permission leaf exists for links today — membership-gated only.
    requiredPermission: null,
    isSummary: false,
    inputSchema: {
      type: "object",
      required: ["id", "targetIssueId"],
      properties: { id: { type: "string" }, targetIssueId: { type: "string" } },
    },
    outputSchema: { type: "object", description: "{data: QtIssueLink}" },
  },
  // ── Sprint ───────────────────────────────────────────────────────────────
  {
    name: "summarize_sprint",
    description: "Compact sprint summary: goal, dates, issue counts, burndown, top open issues.",
    entity: "sprint",
    http: { method: "GET", pathTemplate: "/api/sprints/{id}/summary" },
    riskClass: "read",
    requiredPermission: null,
    isSummary: true,
    inputSchema: idParam("QtSprint id"),
    outputSchema: { type: "object", description: "See summary contract §3.3" },
  },
  {
    name: "list_sprints",
    description: "List sprints for a project with per-sprint issue counts.",
    entity: "sprint",
    http: { method: "GET", pathTemplate: "/api/sprints" },
    riskClass: "read",
    requiredPermission: null,
    isSummary: false,
    inputSchema: {
      type: "object",
      required: ["projectId"],
      properties: { projectId: { type: "string" }, limit: { type: "integer", maximum: 50 } },
    },
    outputSchema: { type: "object", description: "{data: QtSprint[]}" },
  },
  {
    name: "create_sprint",
    description: "Create a sprint in PLANNING status.",
    entity: "sprint",
    http: { method: "POST", pathTemplate: "/api/sprints" },
    riskClass: "soft_write",
    requiredPermission: "Sprint:create",
    isSummary: false,
    inputSchema: {
      type: "object",
      required: ["projectId", "name"],
      properties: {
        projectId: { type: "string" },
        name: { type: "string", maxLength: 120 },
        goal: { type: "string", maxLength: 2000 },
        startDate: { type: "string", format: "date-time" },
        endDate: { type: "string", format: "date-time" },
      },
    },
    outputSchema: { type: "object", description: "{data: QtSprint}" },
  },
  {
    name: "update_sprint",
    description: "Update sprint name/goal/dates.",
    entity: "sprint",
    http: { method: "PATCH", pathTemplate: "/api/sprints/{id}" },
    riskClass: "medium_write",
    requiredPermission: "Sprint:update",
    isSummary: false,
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" }, name: { type: "string" }, goal: { type: "string" } },
    },
    outputSchema: { type: "object", description: "{data: QtSprint}" },
  },
  {
    name: "start_sprint",
    description: "Transition a sprint from PLANNING to ACTIVE.",
    entity: "sprint",
    http: { method: "PATCH", pathTemplate: "/api/sprints/{id}/start" },
    riskClass: "medium_write",
    requiredPermission: "Sprint:update",
    isSummary: false,
    inputSchema: idParam("QtSprint id"),
    outputSchema: { type: "object", description: "{data: QtSprint}" },
  },
  {
    name: "complete_sprint",
    description: "Transition a sprint from ACTIVE to COMPLETED; freezes a velocity snapshot and moves incomplete issues.",
    entity: "sprint",
    http: { method: "POST", pathTemplate: "/api/sprints/{id}/complete" },
    // high_risk, not medium_write: bulk (moves every incomplete issue in one
    // call) AND irreversible (freezes an immutable QtSprintSnapshot). Per
    // Suyash: high_risk operations are excluded from the persona planner's
    // action catalogue entirely, so an agent can never propose this — humans
    // do it in the UI. Completing the wrong sprint (or the right one early)
    // is disruptive and awkward to unwind; nothing gained by automating it.
    riskClass: "high_risk",
    requiredPermission: "Sprint:update",
    isSummary: false,
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        moveOpenTo: { type: "string", nullable: true, description: '"backlog" | "new" | <sprintId> | null' },
      },
    },
    outputSchema: { type: "object", description: "{data: QtSprint}" },
  },
  // ── Project ──────────────────────────────────────────────────────────────
  {
    name: "summarize_project",
    description: "Project dashboard aggregate: status/type/priority/assignee counts, progress, recent activity, epic progress.",
    entity: "project",
    http: { method: "GET", pathTemplate: "/api/projects/{id}/summary" },
    riskClass: "read",
    // Declared per §2.4's explicit instruction even though the route today
    // checks membership only, not this grant — this is the one deliberate
    // "declare the intended pair" case in the doc, not an oversight.
    requiredPermission: "ProjectSummary:view",
    isSummary: true,
    inputSchema: idParam("QtProject id"),
    outputSchema: { type: "object", description: "Dashboard aggregate — heavier than a token-budgeted AI summary; see project-summary route" },
  },
  {
    name: "list_projects",
    description: "List projects (active/archived/trash views).",
    entity: "project",
    http: { method: "GET", pathTemplate: "/api/projects" },
    riskClass: "read",
    requiredPermission: null,
    isSummary: false,
    inputSchema: { type: "object", properties: { search: { type: "string" }, view: { enum: ["active", "archived", "trash"] } } },
    outputSchema: { type: "object", description: "{data: QtProject[]}" },
  },
  {
    name: "create_project",
    description: "Create a project; seeds statuses, issue types, and default roles.",
    entity: "project",
    http: { method: "POST", pathTemplate: "/api/projects" },
    riskClass: "soft_write",
    requiredPermission: "Project:create",
    isSummary: false,
    inputSchema: {
      type: "object",
      required: ["name", "projectKey"],
      properties: {
        name: { type: "string" },
        projectKey: { type: "string", pattern: "^[A-Z][A-Z0-9]{1,9}$" },
        projectType: { type: "string" },
        templateKey: { enum: ["scrum", "functional", "discovery"] },
      },
    },
    outputSchema: { type: "object", description: "{data: QtProject}" },
  },
  // ── Timesheet ────────────────────────────────────────────────────────────
  {
    name: "log_time",
    description: "Log time against an issue.",
    entity: "issue",
    http: { method: "POST", pathTemplate: "/api/timesheets" },
    riskClass: "soft_write",
    requiredPermission: "Timesheet:create",
    isSummary: false,
    inputSchema: {
      type: "object",
      required: ["issueId", "entryDate", "hours"],
      properties: {
        issueId: { type: "string" },
        entryDate: { type: "string", format: "date-time" },
        hours: { type: "number", minimum: 0.0166, maximum: 24 },
        description: { type: "string", maxLength: 2000 },
      },
    },
    outputSchema: { type: "object", description: "{data: QtTimesheetEntry}" },
  },
];
