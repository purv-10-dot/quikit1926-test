// Generate an OpenAPI 3.1 skeleton by scanning app/api/**/route.ts.
//
// For every route file we detect which HTTP methods it exports and turn its
// folder path into an OpenAPI path (`[id]` -> `{id}`). Each operation gets a
// tag (its top-level segment), the global bearerAuth security requirement, and
// generic responses. High-value groups can be enriched by hand in
// lib/openapi/enrichments.ts, which is merged over this skeleton at serve time.
//
// Run: node scripts/gen-openapi.mjs   (also wired into prebuild via package.json)
// Output: lib/openapi/generated.json

import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(__dirname, "..", "app");
const API_DIR = join(APP_DIR, "api");
const OUT_DIR = join(__dirname, "..", "lib", "openapi");
const OUT_FILE = join(OUT_DIR, "generated.json");

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

// Routes excluded from the public reference: framework/meta/internal surfaces
// no external consumer should call.
const EXCLUDE_SEGMENTS = new Set([
  "auth", // NextAuth catch-all
  "cron", // scheduled jobs (secret-gated)
  "internal", // internal provisioning
  "debug", // dev-only
  "health", // infra probe
  "session", // internal session validation
]);

/** Recursively find every route.ts under app/api. */
function findRoutes(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...findRoutes(full));
    } else if (entry === "route.ts" || entry === "route.tsx") {
      out.push(full);
    }
  }
  return out;
}

/** Detect exported HTTP methods, incl. `export { handler as GET }` aliases. */
function detectMethods(source) {
  const found = new Set();
  for (const m of METHODS) {
    const patterns = [
      new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b`),
      new RegExp(`export\\s+const\\s+${m}\\b`),
      new RegExp(`as\\s+${m}\\b`), // export { handler as GET }
    ];
    if (patterns.some((p) => p.test(source))) found.add(m);
  }
  return [...found];
}

/** app/api/projects/[id]/statuses -> /api/projects/{id}/statuses  */
function toApiPath(routeFile) {
  const rel = relative(APP_DIR, dirname(routeFile));
  const segments = rel.split(sep).map((s) => s.replace(/^\[(?:\.\.\.)?(.+)\]$/, "{$1}"));
  return "/" + segments.join("/");
}

/** Tag = first segment after /api (e.g. "issues", "projects"). */
function tagFor(apiPath) {
  const parts = apiPath.split("/").filter(Boolean); // ["api", "issues", ...]
  return parts[1] ?? "misc";
}

// Detailed, Markdown-formatted descriptions shown at the top of each group.
// Kept accurate to the actual endpoints in each area.
const TAG_DESCRIPTIONS = {
  activity: `A chronological audit trail of changes across the organization — issue updates, status changes, comments, and more.

Use \`GET /api/activity\` to page through recent events; results are scoped to the projects you can access. \`POST\` records a new activity entry. Handy for building "recent activity" feeds or syncing changes into an external system.`,

  apps: `The QuikIT app launcher for the signed-in user.

\`GET /api/apps/switcher\` returns the list of QuikIT apps (QuikTrack, QuikCRM, …) the user has access to, used to render the cross-app switcher. Read-only.`,

  backlog: `Issues that live in a project's backlog and haven't been pulled into an active sprint yet.

\`GET /api/backlog/issues\` returns the backlog for a project (pass \`projectId\`), ordered for sprint planning. Combine with the **sprints** endpoints to move work from the backlog into a sprint.`,

  checklist: `Reusable checklist items and the statuses that track their completion.

Create, list, update, and delete checklist items (\`/api/checklist\`) and manage the set of checklist statuses (\`/api/checklist/statuses\`). Checklists attach to issues to break work into verifiable steps.`,

  dashboard: `Aggregated, personalized data for the QuikTrack dashboard.

\`GET /api/dashboard/for-you\` returns the current user's tailored view — assigned work, mentions, and items needing attention — already scoped to what they can see.`,

  docs: `Project documents: rich-text pages, uploaded files, folders, and shareable links.

Manage documents (\`/api/docs\`), upload assets (\`/api/docs/upload\`), organize them into folders, and create public **share links** (\`/api/docs/{id}/share\`) that let people view a document without a QuikTrack account. Access follows document- and project-level permissions.`,

  feedback: `Product feedback submitted by users from inside the app.

\`POST /api/feedback\` records a new feedback entry; \`GET\` lists submitted feedback. Useful for routing in-app feedback into your own triage workflow.`,

  filters: `Saved issue filters — named, reusable sets of search criteria.

Create and manage filters so users (and API callers) can re-run the same query without rebuilding it each time. Filters are scoped to the user and organization.`,

  groups: `Board groupings — how issues are clustered on a board (by status, assignee, custom field, etc.) and the ability to move a task between groups.

Manage group definitions (\`/api/groups\`) and reposition work with \`/api/groups/move-task\`. Pair with **projects → grouped-board** to render a grouped board view.`,

  issues: `The core of QuikTrack — work items of every type (tasks, bugs, stories, epics, and subtasks).

This is the richest area of the API. You can:
- **List & create** issues (\`GET\`/\`POST /api/issues\`), filtered by project, status, sprint, assignee, type, and custom fields.
- **Read, update, delete** a single issue (\`/api/issues/{id}\`) and fetch its full detail (\`/full\`) or change **history**.
- Manage **comments**, **attachments**, and **links** between issues.
- **Move** an issue between statuses/sprints and roll up subtask progress to parents.
- **Bulk import** and **bulk delete** for large operations.

Every action respects project membership and field-level permissions.`,

  me: `Information about the currently-authenticated user (the owner of the Bearer token).

Read your effective **access** (\`/api/me/access\`), org- and project-level **permissions** (\`/api/me/permissions\`, \`/api/me/project-permissions\`), and onboarding **tour state**. Use these to decide what UI or actions to expose before making a call that might return \`403\`.`,

  migration: `One-way data import from external trackers into QuikTrack.

\`POST /api/migration/jira\` imports projects and issues from Jira. Intended for onboarding, not continuous sync.`,

  notifications: `In-app notifications for the current user.

List notifications (\`GET /api/notifications\`), get the **unread count** for a badge (\`/unread-count\`), and **mark as read** individually or in bulk (\`/mark-read\`).`,

  org: `Organization administration: users, roles, and permission assignments. **Admin-only** for most write operations.

Manage org **users** (invite, update, change status/role, view permissions) and **roles** (create roles, assign permissions and field-level permissions, list members). These endpoints govern who can do what across the whole organization.`,

  projects: `Projects and everything scoped inside them — the second-largest area of the API.

Manage projects themselves (create, read, update, archive/restore) plus their nested resources:
- **members** and their per-project **roles / permissions**
- **statuses** (workflow columns) and their ordering
- **custom fields** and issue-field configuration
- project **roles**, **groups**, **links**, **docs**, and a project **summary**

Access to each project follows the caller's membership and role in that project.`,

  reports: `Analytics and reporting across your work.

Includes **executive** summaries (org- and employee-level), **resource** allocation, per-**task** and per-**user** time reports (with CSV **export**), role-based user breakdowns, and saved report **views**. Results are aggregated and scoped to what the caller can access.`,

  search: `Cross-entity search over QuikTrack.

\`GET /api/search\` returns matching issues, projects, and other entities in one call, filtered to what the caller can access. Use it to power a global search box.`,

  settings: `Organization-level settings and custom-field definitions.

Read and update **company** settings (\`/api/settings/company\`) and define the **custom fields** available on issues across the org (\`/api/settings/custom-fields\`). Typically admin-managed.`,

  sprints: `Sprints and their lifecycle.

Create and list sprints (\`/api/sprints\`), read/update a single sprint, and drive its lifecycle: **start** a sprint (\`/{id}/start\`) and **complete** it (\`/{id}/complete\`), which moves unfinished work back to the backlog. Pair with **backlog** and **issues** for full sprint planning.`,

  statuses: `Issue statuses (workflow states).

\`/api/statuses/{id}\` reads and updates a single status. Statuses are normally created and ordered per-project via the **projects → statuses** endpoints; this group covers direct status operations.`,

  teams: `Teams and their membership.

Create and list teams (\`/api/teams\`) and manage each team's **members** (\`/api/teams/{id}/members\`). Teams group people for assignment, reporting, and access.`,

  timesheets: `Time tracking — hours logged against issues and projects.

Log and list time entries (\`/api/timesheets\`), read/update/delete a single entry (\`/{id}\`), fetch a weekly **grid** view (\`/grid\`), and **copy the previous week** to jump-start the current one. Entries are scoped to the logging user.`,

  users: `User lookup within the organization.

\`GET /api/users/search\` finds users by name or email — used to populate assignee and mention pickers. Returns only users the caller is allowed to see.`,

  "view-prefs": `Per-user view preferences.

Store and retrieve a user's UI preferences (column layouts, sort orders, saved view state) so the app restores their setup across sessions and devices.`,
};

/** Rough singular of a resource segment ("issues" -> "issue"). */
function singular(word) {
  if (/ies$/.test(word)) return word.replace(/ies$/, "y");
  if (/(ses|ches|shes|xes)$/.test(word)) return word.replace(/es$/, "");
  if (/s$/.test(word) && !/ss$/.test(word)) return word.replace(/s$/, "");
  return word;
}

// Leaf segments that ARE verbs — the action itself names the operation
// ("/sprints/{id}/start" -> "Start sprint").
const VERB_ACTIONS = {
  move: "Move",
  start: "Start",
  complete: "Complete",
  restore: "Restore",
  reorder: "Reorder",
  export: "Export",
  import: "Import",
  "mark-read": "Mark read:",
  "copy-previous-week": "Copy previous week of",
  "bulk-delete": "Bulk-delete",
  "bulk-import": "Bulk-import",
  "provision-roles": "Provision roles for",
};

// Leaf segments that are NOUN sub-resources of their parent
// ("/projects/{id}/members" -> "List members of project").
const NOUN_SUBRESOURCES = new Set([
  "permissions", "members", "field-permissions", "roles", "statuses",
  "custom-fields", "docs", "folders", "links", "comments", "attachments",
  "history", "shares", "groups", "issue-fields", "unread-count",
]);

const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
const article = (w) => (/^[aeiou]/i.test(w) ? "an" : "a");
const tidy = (s) => s.replace(/\s+/g, " ").trim();

/**
 * Build a readable summary + description for an operation from its method and
 * path — so every endpoint shows helper text instead of a bare stub.
 */
function describeOperation(method, apiPath) {
  const parts = apiPath.split("/").filter(Boolean).slice(1); // drop "api"
  const last = parts[parts.length - 1] ?? "";
  const isParam = /^\{.+\}$/.test(last);
  const desc = `${method} ${apiPath}. Requires a Bearer token; runs as your user within your organization.`;

  const parentSeg =
    [...parts.slice(0, -1)].reverse().find((p) => !/^\{.+\}$/.test(p)) ?? parts[0] ?? "resource";
  const parent = singular(parentSeg).replace(/-/g, " ");

  // 1. Verb-action leaf (e.g. /sprints/{id}/start → "Start sprint").
  if (!isParam && VERB_ACTIONS[last] && parts.length > 1) {
    return { summary: tidy(`${VERB_ACTIONS[last]} ${parent}`), description: desc };
  }

  // 2. Noun sub-resource leaf (e.g. /projects/{id}/members → "List members of project").
  if (!isParam && NOUN_SUBRESOURCES.has(last) && parts.length > 1) {
    const leaf = last.replace(/-/g, " ");
    const leafSingular = singular(last).replace(/-/g, " ");
    let summary;
    switch (method) {
      case "GET": summary = `List ${leaf} of ${parent}`; break;
      case "POST": summary = `Add ${article(leafSingular)} ${leafSingular} to ${parent}`; break;
      case "PUT":
      case "PATCH": summary = `Update ${leaf} of ${parent}`; break;
      case "DELETE": summary = `Remove ${leafSingular} from ${parent}`; break;
      default: summary = `${method} ${leaf} of ${parent}`;
    }
    return { summary: tidy(summary), description: desc };
  }

  // 3. Standard CRUD on the resource itself.
  const resource = singular(parentSeg).replace(/-/g, " ");
  const collection = (isParam ? parentSeg : last).replace(/-/g, " ");
  let summary;
  switch (method) {
    case "GET": summary = isParam ? `Get ${article(resource)} ${resource}` : `List ${collection}`; break;
    case "POST": summary = `Create ${article(resource)} ${resource}`; break;
    case "PUT":
    case "PATCH": summary = `Update ${article(resource)} ${resource}`; break;
    case "DELETE": summary = `Delete ${article(resource)} ${resource}`; break;
    default: summary = `${method} ${apiPath}`;
  }
  return { summary: tidy(summary), description: desc };
}

function isExcluded(routeFile) {
  const rel = relative(API_DIR, dirname(routeFile));
  const first = rel.split(sep)[0];
  return EXCLUDE_SEGMENTS.has(first);
}

/** Path params for an operation, derived from {tokens} in the path. */
function pathParams(apiPath) {
  const names = [...apiPath.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  return names.map((name) => ({
    name,
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
}

const routes = findRoutes(API_DIR);
const paths = {};
const tagSet = new Set();
let opCount = 0;

for (const file of routes) {
  if (isExcluded(file)) continue;
  const apiPath = toApiPath(file);
  // Skip the token + docs meta-routes; documented separately / not "try it".
  if (apiPath === "/api/v1/token" || apiPath.startsWith("/api/v1/docs") || apiPath.startsWith("/api/v1/openapi")) {
    continue;
  }
  const source = readFileSync(file, "utf8");
  const methods = detectMethods(source);
  if (methods.length === 0) continue;

  const tag = tagFor(apiPath);
  tagSet.add(tag);
  const params = pathParams(apiPath);
  paths[apiPath] ??= {};

  for (const method of methods) {
    opCount += 1;
    const { summary, description } = describeOperation(method, apiPath);
    paths[apiPath][method.toLowerCase()] = {
      tags: [tag],
      summary,
      description,
      operationId: `${method.toLowerCase()}_${apiPath.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "")}`,
      ...(params.length ? { parameters: params } : {}),
      responses: {
        200: { description: "Success" },
        401: { description: "Missing or invalid Bearer token" },
        403: { description: "No access to this resource" },
        404: { description: "Not found" },
      },
    };
  }
}

const spec = {
  paths,
  tags: [...tagSet].sort().map((name) => ({
    name,
    ...(TAG_DESCRIPTIONS[name] ? { description: TAG_DESCRIPTIONS[name] } : {}),
  })),
  _meta: { generatedOperations: opCount, generatedPaths: Object.keys(paths).length },
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(spec, null, 2) + "\n");
console.log(
  `[gen-openapi] ${opCount} operations across ${Object.keys(paths).length} paths -> ${relative(process.cwd(), OUT_FILE)}`,
);
