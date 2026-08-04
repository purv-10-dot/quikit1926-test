import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import {
  allPermissionPairs,
  SPACE_ADMIN_ROLE_NAME,
} from "@/lib/api/permissionsRegistry";

// Default statuses for a new project. These are the SAME names as the default
// board columns (To Do / In Progress / In Review / Done) so that — with no
// workflow enabled — the free status dropdown matches the board 1:1 (each
// column maps to its same-name status). Categories drive Done/open-work logic:
// To Do=BACKLOG, In Progress/In Review=IN_PROGRESS, Done=DONE.
export const DEFAULT_STATUSES = [
  { name: "To Do", color: "#94a3b8", category: "BACKLOG", orderIndex: 0 },
  { name: "In Progress", color: "#2563eb", category: "IN_PROGRESS", orderIndex: 1 },
  { name: "In Review", color: "#9333ea", category: "IN_PROGRESS", orderIndex: 2 },
  { name: "Done", color: "#16a34a", category: "DONE", orderIndex: 3 },
];

/**
 * Jira-style default BOARD COLUMNS. These are the named containers shown on the
 * board (To Do / In Progress / In Review / Done) — they are NOT statuses. A
 * status becomes visible on the board only once it's mapped into a column (via
 * Board Settings). Classic statuses get a sensible default mapping below;
 * custom statuses stay unmapped until an admin drags them in.
 */
export const DEFAULT_BOARD_COLUMNS = [
  { name: "To Do", orderIndex: 0 },
  { name: "In Progress", orderIndex: 1 },
  { name: "In Review", orderIndex: 2 },
  { name: "Done", orderIndex: 3 },
];

// Default mapping of classic status NAME → board column NAME. Only these named
// classic statuses are auto-mapped; any other (custom) status is left unmapped.
export const CLASSIC_STATUS_TO_COLUMN: Record<string, string> = {
  Open: "To Do",
  Reopened: "To Do",
  "In Progress": "In Progress",
  Resolved: "In Review",
  Closed: "Done",
};

export const DEFAULT_ISSUE_TYPES = [
  { name: "Epic", color: "#9333ea", icon: "Zap", orderIndex: 0 },
  { name: "Story", color: "#16a34a", icon: "BookOpen", orderIndex: 1 },
  { name: "Task", color: "#2563eb", icon: "CheckSquare", orderIndex: 2 },
  { name: "Bug", color: "#dc2626", icon: "Bug", orderIndex: 3 },
  { name: "Subtask", color: "#64748b", icon: "ListTree", orderIndex: 4 },
];

export const DEFAULT_RESOLUTIONS = [
  { name: "Done", orderIndex: 0 },
  { name: "Won't Do", orderIndex: 1 },
  { name: "Duplicate", orderIndex: 2 },
  { name: "Cannot Reproduce", orderIndex: 3 },
];

/**
 * Transitions of the seeded "classic default workflow" (Jira classic), expressed
 * by STATUS NAME (resolved to the project's just-created QtIssueStatus ids).
 *
 * Every status has an incoming NORMAL transition so the graph is fully reachable
 * from the initial status (the publish gate rejects unreachable statuses):
 *   Create → To Do → In Progress → In Review → Done → (reopen) → In Progress.
 * INITIAL runs on issue creation. Defined over the DEFAULT_STATUSES names so a
 * space's default statuses and its default workflow line up.
 */
const CLASSIC_WORKFLOW_NAME = "classic default workflow";
const CLASSIC_INITIAL_STATUS = "To Do";
const CLASSIC_TRANSITIONS: Array<{
  name: string;
  type: "INITIAL" | "NORMAL" | "GLOBAL";
  from: string[];
  to: string;
}> = [
  { name: "Create", type: "INITIAL", from: [], to: "To Do" },
  { name: "Start Progress", type: "NORMAL", from: ["To Do"], to: "In Progress" },
  { name: "Ready for Review", type: "NORMAL", from: ["In Progress"], to: "In Review" },
  { name: "Done", type: "NORMAL", from: ["In Review"], to: "Done" },
  { name: "Reopen", type: "NORMAL", from: ["Done"], to: "In Progress" },
];

/**
 * Seed a published "classic default workflow" for a new project + a scheme with
 * a single default item mapping every issue type to it. Idempotent per project
 * (skips if a scheme already exists). Also seeds the org's resolution catalog.
 */
/**
 * Ensure the project has Jira-style board columns and that its classic statuses
 * are mapped into them.
 *
 * Rules (owner spec):
 *   • If the project ALREADY has board columns → preserve them, create nothing.
 *     (A returning project keeps its custom columns exactly as they are.)
 *   • If it has NO columns → create the default To Do / In Progress / In Review /
 *     Done columns, then auto-map the classic statuses (Open/Reopened → To Do,
 *     In Progress → In Progress, Resolved → In Review, Closed → Done) BY NAME.
 *   • Custom statuses are never auto-mapped — they stay in the Unmapped bucket
 *     until an admin drags them into a column in Board Settings.
 *   • A status is never mapped into two columns (QtBoardColumnStatus.statusId is
 *     the PK), so each classic status lands in exactly one column.
 *
 * Idempotent: keyed on "no columns exist", so it's safe to call on new-project
 * create AND on workflow-enable for a project that already had a scheme.
 */
export async function seedBoardColumns(
  tx: Prisma.TransactionClient,
  projectId: string,
): Promise<void> {
  // Preserve existing columns — never clobber a configured board.
  const existingColumn = await tx.qtBoardColumn.findFirst({
    where: { projectId },
    select: { id: true },
  });
  if (existingColumn) return;

  // Create the default columns and keep their ids by name for mapping.
  const columnIdByName = new Map<string, string>();
  for (const col of DEFAULT_BOARD_COLUMNS) {
    const created = await tx.qtBoardColumn.create({
      data: { projectId, name: col.name, orderIndex: col.orderIndex },
      select: { id: true },
    });
    columnIdByName.set(col.name, created.id);
  }

  const statuses = await tx.qtIssueStatus.findMany({
    where: { projectId, isDeleted: false },
    select: { id: true, name: true },
  });
  const statusByName = new Map(statuses.map((s) => [s.name, s]));

  // Decide the ONE status each column owns. Priority:
  //   1. A status whose name matches the column exactly ("To Do" → "To Do").
  //      This keeps a project's own statuses as its columns.
  //   2. Otherwise the classic status that maps to this column by convention
  //      (Open → To Do, In Progress → In Progress, Resolved → In Review,
  //       Closed → Done). Used by pure-classic projects that have no same-name
  //      status.
  // Any status not chosen here stays UNMAPPED (hidden) until an admin maps it.
  // A status is used at most once (statusId is the PK of QtBoardColumnStatus).
  const used = new Set<string>();
  let orderIndex = 0;
  for (const col of DEFAULT_BOARD_COLUMNS) {
    const columnId = columnIdByName.get(col.name)!;

    // 1. Same-name status.
    let chosen = statusByName.get(col.name);

    // 2. Classic fallback — first classic status that maps to this column and
    //    isn't already used, and only when no same-name status was found.
    if (!chosen) {
      for (const [statusName, columnName] of Object.entries(CLASSIC_STATUS_TO_COLUMN)) {
        if (columnName !== col.name) continue;
        const s = statusByName.get(statusName);
        if (s && !used.has(s.id)) {
          chosen = s;
          break;
        }
      }
    }

    if (chosen && !used.has(chosen.id)) {
      used.add(chosen.id);
      await tx.qtBoardColumnStatus.create({
        data: { statusId: chosen.id, columnId, orderIndex: orderIndex++ },
      });
    }
  }
}

export async function seedProjectWorkflow(
  tx: Prisma.TransactionClient,
  projectId: string,
  orgId: string,
  createdBy: string | null = null,
): Promise<void> {
  // Org resolution catalog (shared across the org's projects).
  await tx.qtResolution.createMany({
    data: DEFAULT_RESOLUTIONS.map((r) => ({ ...r, orgId })),
    skipDuplicates: true,
  });

  // Ensure board columns exist + classic statuses are mapped. Runs even when a
  // scheme already exists (below early-returns), so already-enabled projects
  // still get a board. No-ops when the project already has columns.
  await seedBoardColumns(tx, projectId);

  // Don't clobber an existing scheme (idempotent re-seed).
  const existingScheme = await tx.qtWorkflowScheme.findUnique({
    where: { projectId },
    select: { id: true },
  });
  if (existingScheme) return;

  // Map status NAME → id for this project's seeded statuses.
  const statuses = await tx.qtIssueStatus.findMany({
    where: { projectId },
    select: { id: true, name: true },
  });
  const statusIdByName = new Map(statuses.map((s) => [s.name, s.id]));

  const workflow = await tx.qtWorkflow.create({
    data: {
      orgId,
      projectId,
      name: CLASSIC_WORKFLOW_NAME,
      description: "Default lifecycle seeded on space creation.",
      isActive: true,
      createdBy,
    },
    select: { id: true },
  });

  // Nodes: every project status participates; the classic initial node is Open.
  await tx.qtWorkflowStatus.createMany({
    data: statuses.map((s) => ({
      workflowId: workflow.id,
      statusId: s.id,
      isInitial: s.name === CLASSIC_INITIAL_STATUS,
    })),
    skipDuplicates: true,
  });

  // Edges + their source-status joins. Skip any transition whose endpoints
  // aren't present (defensive — statuses are seeded just above).
  let initialTransitionId: string | null = null;
  for (const [i, t] of CLASSIC_TRANSITIONS.entries()) {
    const toId = statusIdByName.get(t.to);
    if (!toId) continue;
    const fromIds = t.from
      .map((n) => statusIdByName.get(n))
      .filter((id): id is string => Boolean(id));
    const transition = await tx.qtWorkflowTransition.create({
      data: {
        workflowId: workflow.id,
        name: t.name,
        type: t.type,
        toStatusId: toId,
        orderIndex: i,
      },
      select: { id: true },
    });
    if (fromIds.length > 0) {
      await tx.qtWorkflowTransitionFrom.createMany({
        data: fromIds.map((statusId) => ({
          transitionId: transition.id,
          statusId,
        })),
        skipDuplicates: true,
      });
    }
    if (t.type === "INITIAL") initialTransitionId = transition.id;
  }

  if (initialTransitionId) {
    await tx.qtWorkflow.update({
      where: { id: workflow.id },
      data: { initialTransitionId },
    });
  }

  // Scheme + default item (issueTypeId NULL → applies to every type).
  const scheme = await tx.qtWorkflowScheme.create({
    data: { orgId, projectId, name: "Default Workflow Scheme" },
    select: { id: true },
  });
  await tx.qtWorkflowSchemeItem.create({
    data: {
      schemeId: scheme.id,
      issueTypeId: null,
      workflowId: workflow.id,
      isDefault: true,
    },
  });
}

/**
 * Three starter project roles seeded on every new project. Admins can rename,
 * delete, or add roles per project from the User Management UI.
 *
 *   - Space Admin → full control (every valid grant). Auto-assigned to creator.
 *   - Contributor → builds and ships: create/edit issues, comments, timesheets,
 *                   docs, sprints. Can delete only their OWN issues/timesheets
 *                   (enforced in the route layer, not via a flat delete grant).
 *                   Default role for new project members.
 *   - Viewer      → read-only.
 *
 * Canonical grant matrices are defined relative to PROJECT_SHELL_VIEW — the
 * minimum "can see the project shell" set that every Layer-2 role needs
 * (project metadata, every tab, board, docs, reports,
 * sprints/issues/comments/timesheets at view-level).
 */
const PROJECT_SHELL_VIEW: Array<{ resource: string; action: string }> = [
  { resource: "Project", action: "view" },
  { resource: "ProjectMember", action: "view" },
  { resource: "Board", action: "view" },
  { resource: "GroupedKanban", action: "view" },
  { resource: "ProjectSummary", action: "view" },
  { resource: "ProjectTimeline", action: "view" },
  { resource: "ProjectBacklog", action: "view" },
  { resource: "ProjectList", action: "view" },
  { resource: "ProjectTaskTable", action: "view" },
  { resource: "ProjectReports", action: "view" },
  { resource: "Doc", action: "view" },
  { resource: "Timesheet", action: "view" },
  // Discovery: `IdeaView:view` gates the "Ideas" tab + the view list. Ideas
  // themselves are membership-based (no Idea:view), matching Issue. Harmless on
  // non-discovery spaces — the tab only renders for discovery projects.
  { resource: "IdeaView", action: "view" },
  // Note: Issue / Sprint / IssueComment have no `view` grant — their visibility
  // is membership-based, not gated by a permission (see permissionsRegistry).
  // Report / Home / Dashboards are app-wide-only — governed by the app-wide
  // role, not seeded into project roles.
];

// Contributor = the former Developer + QA merged. Union of their grants is the
// Developer set (QA was a subset minus Sprint:update). No flat Issue/Timesheet
// delete grant — "delete own" is enforced by ownership checks in the routes.
const CONTRIBUTOR_GRANTS: Array<{ resource: string; action: string }> = [
  ...PROJECT_SHELL_VIEW,
  { resource: "Issue", action: "create" },
  { resource: "Issue", action: "update" },
  { resource: "IssueComment", action: "create" },
  { resource: "Sprint", action: "update" },
  { resource: "Doc", action: "create" },
  { resource: "Doc", action: "update" },
  { resource: "Timesheet", action: "create" },
  // Discovery: create/edit/archive ideas and manage saved views. Permanent
  // Idea:delete stays Space-Admin-only (FR §5.3), so it's not granted here.
  { resource: "Idea", action: "create" },
  { resource: "Idea", action: "update" },
  { resource: "IdeaView", action: "create" },
  { resource: "IdeaView", action: "update" },
  // No IssueComment/Timesheet update grant — those edits are author/owner-only
  // (ownership checks in the routes), not permission grants.
];

const VIEWER_GRANTS: Array<{ resource: string; action: string }> = [
  ...PROJECT_SHELL_VIEW,
];

/* ───────────────────── Field-level seed per role ───────────────────── */
// Rows are added only where a role's field deviates from the default
// (editable). Space Admin stays editable across the board — no rows needed.
// Contributor gets readonly locks on fields it shouldn't change (the lighter
// former-Developer set).

type FieldRow = {
  entity: string;
  field: string;
  level: "hidden" | "readonly" | "editable" | "required";
};

const CONTRIBUTOR_FIELD_PERMS: FieldRow[] = [
  { entity: "Issue", field: "type", level: "readonly" },
  { entity: "Issue", field: "priority", level: "readonly" },
  { entity: "Issue", field: "reporter", level: "readonly" },
  { entity: "Issue", field: "dueDate", level: "readonly" },
  { entity: "Issue", field: "parent", level: "readonly" },
  { entity: "Issue", field: "sprint", level: "readonly" },
  { entity: "Timesheet", field: "billable", level: "readonly" },
];

const VIEWER_FIELD_PERMS: FieldRow[] = [];

export const STARTER_FIELD_PERMS: Record<string, FieldRow[]> = {
  "Space Admin": [],
  Contributor: CONTRIBUTOR_FIELD_PERMS,
  Viewer: VIEWER_FIELD_PERMS,
};

interface StarterRole {
  name: string;
  description: string;
  isDefault: boolean;
  grants: Array<{ resource: string; action: string }>;
}

export const STARTER_PROJECT_ROLES: StarterRole[] = [
  {
    name: SPACE_ADMIN_ROLE_NAME,
    description: "Full control of this space. Auto-assigned to the creator.",
    isDefault: false,
    grants: [], // populated below — every valid pair
  },
  {
    name: "Contributor",
    description:
      "Builds and ships issues. Can delete their own issues and timesheets. Default role for new space members.",
    isDefault: true,
    grants: CONTRIBUTOR_GRANTS,
  },
  {
    name: "Viewer",
    description: "Read-only access to issues, sprints, and comments.",
    isDefault: false,
    grants: VIEWER_GRANTS,
  },
];

export async function seedProjectDefaults(
  tx: Prisma.TransactionClient,
  projectId: string,
  orgId: string,
  createdBy: string | null = null,
) {
  await tx.qtIssueStatus.createMany({
    data: DEFAULT_STATUSES.map((s) => ({ ...s, projectId })),
    skipDuplicates: true,
  });
  await tx.qtIssueType.createMany({
    data: DEFAULT_ISSUE_TYPES.map((t) => ({ ...t, projectId })),
    skipDuplicates: true,
  });

  // Board columns (To Do / In Progress / In Review / Done) so the board works
  // out of the box. NOTE: we deliberately do NOT seed a workflow here — a new
  // project is UNGATED (free status picker) until an admin explicitly enables a
  // workflow via /api/projects/[id]/workflow-scheme/enable. That's the owner
  // rule: "no workflow until you turn it on."
  await seedBoardColumns(tx, projectId);

  // Seed the 3 starter project roles + their grants. Idempotent: if a role
  // with the same name already exists for this project, skip both the role
  // create AND the grants fill (don't clobber admin edits). Fetch the existing
  // names in ONE query instead of a findUnique per role — fewer round-trips
  // keeps this inside the transaction window on a remote (Neon) DB.
  const adminAllPairs = allPermissionPairs();
  const existingRoleNames = new Set(
    (
      await tx.qtProjectRole.findMany({
        where: { projectId },
        select: { name: true },
      })
    ).map((r) => r.name),
  );
  for (const tmpl of STARTER_PROJECT_ROLES) {
    if (existingRoleNames.has(tmpl.name)) continue;

    const role = await tx.qtProjectRole.create({
      data: {
        orgId,
        projectId,
        name: tmpl.name,
        description: tmpl.description,
        isDefault: tmpl.isDefault,
        createdBy,
      },
      select: { id: true },
    });

    const grants =
      tmpl.name === SPACE_ADMIN_ROLE_NAME ? adminAllPairs : tmpl.grants;
    if (grants.length > 0) {
      await tx.qtProjectRolePermission.createMany({
        data: grants.map((g) => ({
          projectRoleId: role.id,
          resource: g.resource,
          action: g.action,
        })),
        skipDuplicates: true,
      });
    }

    // Field-level seed — only rows that deviate from default editable.
    const fieldRows = STARTER_FIELD_PERMS[tmpl.name] ?? [];
    if (fieldRows.length > 0) {
      await tx.qtProjectRoleFieldPermission.createMany({
        data: fieldRows.map((r) => ({
          projectRoleId: role.id,
          entity: r.entity,
          field: r.field,
          level: r.level,
        })),
        skipDuplicates: true,
      });
    }
  }
}

/**
 * Assign a project's default role (`isDefault` — Contributor out of the box) to
 * a member who has no project role yet. The Add-Member / assign-projects UIs
 * only write a `QtProjectUserRole` when the admin explicitly picks a role, so a
 * forgotten pick used to leave the member "Unassigned" (the default flag was
 * never applied as a fallback). This materializes it — the same behaviour the
 * org user-creation flow already applies.
 *
 * Takes the full `db` client (not a tx) so callers can run it after a
 * transaction commits. Idempotent against the (projectId, userId) unique key
 * and never clobbers an existing assignment or an explicit pick. No-ops when
 * the project has no default role configured.
 */
export async function assignDefaultProjectRoleIfNone(
  projectId: string,
  userId: string,
  assignedBy: string,
): Promise<void> {
  const existing = await db.qtProjectUserRole.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { id: true },
  });
  if (existing) return;
  const def = await db.qtProjectRole.findFirst({
    where: { projectId, isDefault: true },
    select: { id: true },
  });
  if (!def) return;
  await db.qtProjectUserRole.create({
    data: { projectId, userId, projectRoleId: def.id, assignedBy },
  });
}

/** Returns the QtProjectRole.id for the named starter role in this project. */
export async function getStarterProjectRoleId(
  tx: Prisma.TransactionClient,
  projectId: string,
  roleName: "Space Admin" | "Contributor" | "Viewer",
): Promise<string | null> {
  const r = await tx.qtProjectRole.findUnique({
    where: { projectId_name: { projectId, name: roleName } },
    select: { id: true },
  });
  return r?.id ?? null;
}

export async function getDefaultStatusId(
  tx: Prisma.TransactionClient,
  projectId: string,
): Promise<string | null> {
  const s = await tx.qtIssueStatus.findFirst({
    where: { projectId, isDeleted: false, isHidden: false },
    orderBy: { orderIndex: "asc" },
    select: { id: true },
  });
  return s?.id ?? null;
}

/**
 * Next work-item key ("PROJ-N") for a project. We derive N from the MAX existing
 * key suffix — NOT `count()+1`, which collides once any issue has been deleted or
 * a key was skipped (count < max ⇒ regenerates an existing key ⇒ unique-key
 * violation on QtIssue). We scan ALL keys (including soft-deleted) so a reused
 * number can never resurrect a deleted item's key. Caller should still wrap the
 * create in a small retry loop to survive a concurrent insert race.
 */
export async function nextIssueKey(
  tx: Prisma.TransactionClient,
  projectId: string,
  projectKey: string,
): Promise<string> {
  const rows = await tx.qtIssue.findMany({
    where: { projectId },
    select: { key: true },
  });
  const prefix = `${projectKey}-`;
  let max = 0;
  for (const { key } of rows) {
    if (!key.startsWith(prefix)) continue;
    const n = Number.parseInt(key.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${projectKey}-${max + 1}`;
}
