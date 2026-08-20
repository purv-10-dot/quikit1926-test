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

/* ──────────────── Chained-parameter provenance ────────────────
 *
 * A parameter whose value comes from ANOTHER operation's output must say so:
 * which operation, which field, what the value looks like, and what it is not.
 * Without that, a model chaining two calls picks a plausible-looking field and
 * fails — the AI Runtime hit exactly this, passing a project NAME from
 * `list_projects` into `list_sprints`:
 *
 *     GET /api/sprints?projectId=Core+API  →  404
 *
 * Correct behaviour on our side, and undiagnosable from the manifest alone.
 * These constants exist so the wording cannot drift between the sites that
 * share a source — `id` (issue) appears on eight operations.
 *
 * NOTE the id/key asymmetry, stated per-parameter below. PROJECTS and ISSUES
 * both resolve either an id or a human-readable key. SPRINTS remain id-only —
 * every sprint route still looks up `where: { id }` with no key fallback — so
 * a model that generalises "keys work" from issues to sprints gets a 404.
 *
 * Issues used to be id-only too, and this comment used to say so. That
 * asymmetry was the failure it predicted: the runtime created `QUIKSC-290`,
 * called `GET /api/issues/QUIKSC-290`, got a 404, correctly diagnosed "it
 * might be a key instead of an ID" — and had no way to act on that, because
 * nothing converted one into the other. The eight issue operations sharing
 * ISSUE_ID_DESC below now resolve either form through
 * `lib/mcp/resolveIssue.ts` (one indexed lookup matching either column, not a
 * format sniff). Sprint lookup fails in the same shape and is a known
 * follow-up — see docs/Quikpilot_docs/AI-Runtime-Enabler-Decisions.md.
 *
 * `assigneeId` and `statusId` are deliberately left without a provenance note:
 * no operation in this manifest produces a user id or a status id, so a note
 * would send the model looking for a tool call that does not exist.
 */
const PROJECT_ID_DESC =
  'The project\'s `id` from `list_projects` — a cuid such as `cmsrjonuq00624tfmmcsxac23`. Not the project name. A projectKey (e.g. "WST") is also accepted, but prefer `id` when chaining from `list_projects`.';

const ISSUE_ID_DESC =
  'The issue\'s `id` from `list_issues` or `get_issue` — a cuid such as `cmsrk1p2h00071tfm9x8lqe4d`. An issue key (e.g. "WST-42", case-insensitive) is also accepted, including the key returned by `create_issue`; prefer `id` when chaining from another call. Not the issue title.';

const SPRINT_ID_DESC =
  "The sprint's `id` from `list_sprints` — a cuid such as `cmsrk3v6y000a1tfm2b7ndq5f`. Not the sprint name.";

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
    inputSchema: idParam(ISSUE_ID_DESC),
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
    inputSchema: idParam(ISSUE_ID_DESC),
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
        projectId: { type: "string", description: PROJECT_ID_DESC },
        statusCategory: { enum: ["BACKLOG", "IN_PROGRESS", "DONE"] },
        assigneeId: { type: "string" },
        sprintId: { type: "string", description: SPRINT_ID_DESC },
        limit: { type: "integer", maximum: 100 },
        // Documented, not added: this parameter already backs the board,
        // backlog, list and saved-filter search boxes. The description states
        // its real scope INCLUDING description-matching, rather than narrowing
        // a filter humans already use. Saying what it does not guarantee is as
        // load-bearing as saying what it does — a description hit is a weak
        // signal (a hundred issues mention "login redirect" in their body; one
        // is titled it), and the model cannot tell a good match from a
        // plausible one. Hence the explicit "not a lookup" steer: key
        // resolution is `get_issue`'s job now, and it is exact.
        search: {
          type: "string",
          description:
            "Free-text filter over this project's issues. Matches a substring of the issue key, title, OR description, case-insensitively. NOT an exact lookup: a description match can return an issue that merely mentions the phrase, so do not assume a single result is the issue you meant — check the returned `key` and `title` before acting on it. If you already know the issue key, call `get_issue` with it instead; that resolves exactly.",
        },
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
        projectId: { type: "string", description: PROJECT_ID_DESC },
        title: { type: "string" },
        description: { type: "string" },
        type: { enum: ["TASK", "BUG", "EPIC", "SUBTASK"] },
        statusId: { type: "string" },
        priority: { enum: ["LOW", "MEDIUM", "HIGH", "URGENT"] },
        assigneeId: { type: "string" },
        sprintId: { type: "string", description: SPRINT_ID_DESC },
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
        id: { type: "string", description: ISSUE_ID_DESC },
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
        id: { type: "string", description: ISSUE_ID_DESC },
        statusId: { type: "string" },
        sprintId: { type: "string", nullable: true, description: SPRINT_ID_DESC },
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
      properties: {
        id: { type: "string", description: ISSUE_ID_DESC },
        subtaskMode: { enum: ["cascade", "detach"] },
      },
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
    inputSchema: idParam(ISSUE_ID_DESC),
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
      properties: {
        id: { type: "string", description: ISSUE_ID_DESC },
        body: { type: "string", maxLength: 20000 },
      },
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
      properties: {
        id: { type: "string", description: ISSUE_ID_DESC },
        targetIssueId: {
          type: "string",
          description:
            'The `id` of the issue to link to, from `list_issues` or `get_issue` — a cuid such as `cmsrk1p2h00071tfm9x8lqe4d`. An issue key (e.g. "WST-42") is also accepted. May be in a different project; cross-project links are intentional.',
        },
      },
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
    inputSchema: idParam(SPRINT_ID_DESC),
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
      properties: {
        projectId: { type: "string", description: PROJECT_ID_DESC },
        limit: { type: "integer", maximum: 50 },
      },
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
        projectId: { type: "string", description: PROJECT_ID_DESC },
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
      properties: {
        id: { type: "string", description: SPRINT_ID_DESC },
        name: { type: "string" },
        goal: { type: "string" },
      },
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
    inputSchema: idParam(SPRINT_ID_DESC),
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
        id: { type: "string", description: SPRINT_ID_DESC },
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
    inputSchema: idParam(PROJECT_ID_DESC),
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
        issueId: {
          type: "string",
          description:
            'The issue\'s `id` from `list_issues` or `get_issue` — a cuid such as `cmsrk1p2h00071tfm9x8lqe4d`. Not the issue key (e.g. "WST-42").',
        },
        entryDate: { type: "string", format: "date-time" },
        hours: { type: "number", minimum: 0.0166, maximum: 24 },
        description: { type: "string", maxLength: 2000 },
      },
    },
    outputSchema: { type: "object", description: "{data: QtTimesheetEntry}" },
  },
];
