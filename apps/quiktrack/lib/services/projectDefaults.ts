import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import {
  allPermissionPairs,
  SPACE_ADMIN_ROLE_NAME,
} from "@/lib/api/permissionsRegistry";

export const DEFAULT_STATUSES = [
  { name: "To Do", color: "#94a3b8", category: "BACKLOG", orderIndex: 0 },
  {
    name: "In Progress",
    color: "#2563eb",
    category: "IN_PROGRESS",
    orderIndex: 1,
  },
  {
    name: "In Review",
    color: "#9333ea",
    category: "IN_PROGRESS",
    orderIndex: 2,
  },
  { name: "Done", color: "#16a34a", category: "DONE", orderIndex: 3 },
];

export const DEFAULT_ISSUE_TYPES = [
  { name: "Epic", color: "#9333ea", icon: "Zap", orderIndex: 0 },
  { name: "Story", color: "#16a34a", icon: "BookOpen", orderIndex: 1 },
  { name: "Task", color: "#2563eb", icon: "CheckSquare", orderIndex: 2 },
  { name: "Bug", color: "#dc2626", icon: "Bug", orderIndex: 3 },
  { name: "Subtask", color: "#64748b", icon: "ListTree", orderIndex: 4 },
];

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
