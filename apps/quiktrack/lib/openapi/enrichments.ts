/**
 * Hand-authored request/response detail for high-value endpoints.
 *
 * The generated skeleton (scripts/gen-openapi.mjs) gives every route a method,
 * path, summary, description and generic responses — but no request bodies or
 * query parameters, so Scalar renders empty "Try it" forms and bare curl. This
 * layer adds real **request-body schemas with examples** and **query params**
 * for the endpoints people actually call first, so the Scalar UI shows valid
 * sample payloads and generates correct curl / Python / Node snippets.
 *
 * Merged OVER the generated skeleton at the operation level in spec.ts, so each
 * entry only needs the fields it wants to add — summary/description/responses
 * come from the generated op unless overridden here.
 *
 * All bodies mirror the server's Zod validators in lib/validation/*.
 */

type Operation = Record<string, unknown>;
type Paths = Record<string, Record<string, Operation>>;

/** application/json request body with a schema + example. */
function body(schema: Record<string, unknown>, example: unknown, required = true) {
  return {
    requestBody: {
      required,
      content: { "application/json": { schema, example } },
    },
  };
}

/** Query parameter definition. */
function q(name: string, description: string, opts: { required?: boolean; example?: unknown; enum?: string[] } = {}) {
  return {
    name,
    in: "query",
    required: opts.required ?? false,
    description,
    schema: { type: "string", ...(opts.enum ? { enum: opts.enum } : {}) },
    ...(opts.example !== undefined ? { example: opts.example } : {}),
  };
}

const issueTypes = ["EPIC", "TASK", "STORY", "BUG", "SUBTASK"];
const priorities = ["LOWEST", "LOW", "MEDIUM", "HIGH", "HIGHEST"];

const createIssueSchema = {
  type: "object",
  required: ["projectId", "title"],
  properties: {
    projectId: { type: "string" },
    title: { type: "string", maxLength: 255 },
    description: { type: "string", maxLength: 50000 },
    type: { type: "string", enum: issueTypes, default: "TASK" },
    priority: { type: "string", enum: priorities, default: "MEDIUM" },
    statusId: { type: "string" },
    parentId: { type: "string" },
    epicId: { type: "string" },
    sprintId: { type: "string" },
    assigneeId: { type: "string" },
    startDate: { type: "string", format: "date-time" },
    dueDate: { type: "string", format: "date-time" },
    eta: { type: "number", minimum: 0, maximum: 10000 },
    storyPoints: { type: "integer", minimum: 0, maximum: 1000 },
    customFields: { type: "object", additionalProperties: true },
  },
};

export const enrichments: Paths = {
  "/api/issues": {
    get: {
      parameters: [
        q("projectId", "Project to list issues for.", { required: true, example: "prj_123" }),
        q("type", "Filter by issue type.", { enum: issueTypes }),
        q("excludeType", "Comma-separated types to exclude, e.g. EPIC,SUBTASK."),
        q("priority", "Filter by priority.", { enum: priorities }),
        q("statusId", "Filter by a specific status id."),
        q("statusCategory", "Filter by status category.", { enum: ["BACKLOG", "IN_PROGRESS", "DONE"] }),
        q("sprintId", "Filter by sprint."),
        q("parentId", "Filter by parent issue (subtasks)."),
        q("epicId", "Filter by epic."),
      ],
    },
    post: body(createIssueSchema, {
      projectId: "prj_123",
      title: "First API-created task",
      description: "Testing issue creation over the API",
      type: "TASK",
      priority: "HIGH",
      eta: 4,
      storyPoints: 3,
      dueDate: "2026-07-31T17:00:00.000Z",
    }),
  },

  "/api/issues/{id}": {
    patch: body(
      {
        type: "object",
        properties: {
          title: { type: "string", maxLength: 255 },
          description: { type: "string" },
          type: { type: "string", enum: issueTypes },
          priority: { type: "string", enum: priorities },
          statusId: { type: "string" },
          sprintId: { type: "string", nullable: true },
          assigneeId: { type: "string", nullable: true },
          epicId: { type: "string", nullable: true },
          parentId: { type: "string", nullable: true },
          startDate: { type: "string", format: "date-time", nullable: true },
          dueDate: { type: "string", format: "date-time", nullable: true },
          eta: { type: "number" },
          storyPoints: { type: "integer" },
        },
      },
      { title: "Renamed via API", priority: "HIGHEST", storyPoints: 5 },
    ),
  },

  "/api/issues/{id}/move": {
    patch: body(
      {
        type: "object",
        properties: {
          statusId: { type: "string" },
          sprintId: { type: "string", nullable: true },
          parentId: { type: "string", nullable: true },
          orderInColumn: { type: "integer", minimum: 0 },
        },
      },
      { statusId: "status_inprogress", orderInColumn: 0 },
    ),
  },

  "/api/issues/{id}/comments": {
    post: body(
      { type: "object", required: ["body"], properties: { body: { type: "string", maxLength: 20000 } } },
      { body: "This comment was posted through the API." },
    ),
  },

  "/api/issues/{id}/links": {
    post: body(
      {
        type: "object",
        required: ["targetIssueId"],
        properties: {
          targetIssueId: { type: "string" },
          type: { type: "string", enum: ["RELATES_TO"], default: "RELATES_TO" },
        },
      },
      { targetIssueId: "iss_456", type: "RELATES_TO" },
    ),
  },

  "/api/issues/bulk-delete": {
    post: body(
      {
        type: "object",
        required: ["ids"],
        properties: { ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 500 } },
      },
      { ids: ["iss_123", "iss_456"] },
    ),
  },

  "/api/projects": {
    post: body(
      {
        type: "object",
        required: ["name", "projectKey"],
        properties: {
          name: { type: "string", maxLength: 120 },
          projectKey: { type: "string", pattern: "^[A-Z][A-Z0-9]{1,9}$", description: "UPPERCASE, starts with a letter, 2–10 chars." },
          description: { type: "string", maxLength: 2000 },
          projectType: { type: "string", enum: ["software", "discovery", "service"] },
          templateKey: { type: "string", enum: ["scrum", "functional"] },
          icon: { type: "string", maxLength: 50 },
          color: { type: "string", pattern: "^#([0-9a-fA-F]{6})$" },
          startDate: { type: "string", format: "date-time" },
          endDate: { type: "string", format: "date-time" },
          leadUserId: { type: "string" },
        },
      },
      {
        name: "API Test Project",
        projectKey: "APITEST",
        description: "Created via the REST API for testing",
        projectType: "software",
        templateKey: "scrum",
        color: "#2563eb",
      },
    ),
  },

  "/api/projects/{id}": {
    patch: body(
      {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          status: { type: "string", enum: ["active", "archived"] },
          color: { type: "string", pattern: "^#([0-9a-fA-F]{6})$" },
        },
      },
      { description: "Updated via API", status: "active" },
    ),
  },

  "/api/projects/{id}/members": {
    post: body(
      {
        type: "object",
        description: "Provide userId OR email.",
        properties: {
          userId: { type: "string" },
          email: { type: "string", format: "email" },
          role: { type: "string", enum: ["PROJECT_ADMIN", "MEMBER", "VIEWER"], default: "MEMBER" },
          message: { type: "string", maxLength: 2000 },
        },
      },
      { email: "teammate@company.com", role: "MEMBER" },
    ),
  },

  "/api/sprints": {
    get: { parameters: [q("projectId", "Project to list sprints for.", { required: true, example: "prj_123" })] },
    post: body(
      {
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
      {
        projectId: "prj_123",
        name: "Sprint 1",
        goal: "Ship the API test features",
        startDate: "2026-07-07T00:00:00.000Z",
        endDate: "2026-07-21T00:00:00.000Z",
      },
    ),
  },

  "/api/sprints/{id}": {
    patch: body(
      {
        type: "object",
        properties: {
          name: { type: "string" },
          goal: { type: "string" },
          startDate: { type: "string", format: "date-time" },
          endDate: { type: "string", format: "date-time" },
        },
      },
      { goal: "Revised sprint goal" },
    ),
  },

  "/api/backlog/issues": {
    get: { parameters: [q("projectId", "Project to list backlog issues for.", { required: true, example: "prj_123" })] },
  },

  "/api/timesheets": {
    post: body(
      {
        type: "object",
        required: ["issueId", "entryDate", "hours"],
        properties: {
          issueId: { type: "string" },
          entryDate: { type: "string", format: "date-time" },
          hours: { type: "number", minimum: 0.0166, maximum: 24, description: "1 minute to 24 hours." },
          description: { type: "string", maxLength: 2000 },
        },
      },
      { issueId: "iss_123", entryDate: "2026-07-07T00:00:00.000Z", hours: 2.5, description: "Investigated via API" },
    ),
  },

  "/api/checklist": {
    post: body(
      {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", maxLength: 255 },
          statusId: { type: "string", nullable: true },
          dueDate: { type: "string", format: "date-time", nullable: true },
        },
      },
      { name: "Verify deployment" },
    ),
  },

  "/api/checklist/statuses": {
    post: body(
      {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", maxLength: 40 },
          color: { type: "string", pattern: "^#([0-9a-fA-F]{6})$" },
        },
      },
      { name: "Blocked", color: "#dc2626" },
    ),
  },

  "/api/groups/move-task": {
    post: body(
      {
        type: "object",
        required: ["issueId", "toIndex"],
        properties: {
          issueId: { type: "string" },
          toGroupId: { type: "string", nullable: true },
          toIndex: { type: "integer", minimum: 0 },
        },
      },
      { issueId: "iss_123", toGroupId: "grp_1", toIndex: 0 },
    ),
  },

  "/api/search": {
    get: { parameters: [q("q", "Search query.", { required: true, example: "login bug" })] },
  },

  "/api/users/search": {
    get: { parameters: [q("q", "Name or email fragment to search users by.", { required: true, example: "jane" })] },
  },
};
