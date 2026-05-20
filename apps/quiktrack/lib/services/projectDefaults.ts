import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { allPermissionPairs } from "@/lib/api/permissionsRegistry";

export const DEFAULT_STATUSES = [
  { name: "To Do", color: "#94a3b8", category: "BACKLOG", orderIndex: 0 },
  { name: "In Progress", color: "#2563eb", category: "IN_PROGRESS", orderIndex: 1 },
  { name: "In Review", color: "#9333ea", category: "IN_PROGRESS", orderIndex: 2 },
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
 * Five starter project roles seeded on every new project. Admins can rename,
 * delete, or add roles per project from the User Management UI.
 *
 * Canonical grant matrices for PM / Developer / QA / Viewer are defined
 * relative to PROJECT_SHELL_VIEW — the minimum "can see the project shell"
 * set that every Layer-2 role needs (project metadata, every tab, board,
 * docs, reports, sprints/issues/comments/timesheets at view-level).
 */
const PROJECT_SHELL_VIEW: Array<{ resource: string; action: string }> = [
  { resource: "Project", action: "view" },
  { resource: "ProjectMember", action: "view" },
  { resource: "Board", action: "view" },
  { resource: "ProjectSummary", action: "view" },
  { resource: "ProjectTimeline", action: "view" },
  { resource: "ProjectBacklog", action: "view" },
  { resource: "ProjectList", action: "view" },
  { resource: "ProjectTaskTable", action: "view" },
  { resource: "Doc", action: "view" },
  { resource: "Report", action: "view" },
  { resource: "Sprint", action: "view" },
  { resource: "Issue", action: "view" },
  { resource: "IssueComment", action: "view" },
  { resource: "Timesheet", action: "view" },
];

const DEVELOPER_GRANTS: Array<{ resource: string; action: string }> = [
  ...PROJECT_SHELL_VIEW,
  { resource: "Issue", action: "create" },
  { resource: "Issue", action: "update" },
  { resource: "IssueComment", action: "create" },
  { resource: "IssueComment", action: "update" },
  { resource: "Sprint", action: "update" },
  { resource: "Board", action: "update" },
  { resource: "Doc", action: "create" },
  { resource: "Doc", action: "update" },
  { resource: "Timesheet", action: "create" },
  { resource: "Timesheet", action: "update" },
];

const QA_GRANTS: Array<{ resource: string; action: string }> = [
  ...PROJECT_SHELL_VIEW,
  { resource: "Issue", action: "create" },
  { resource: "Issue", action: "update" },
  { resource: "IssueComment", action: "create" },
  { resource: "IssueComment", action: "update" },
  { resource: "Board", action: "update" },
  { resource: "Doc", action: "create" },
  { resource: "Doc", action: "update" },
  { resource: "Timesheet", action: "create" },
  { resource: "Timesheet", action: "update" },
];

const PM_GRANTS: Array<{ resource: string; action: string }> = [
  ...DEVELOPER_GRANTS,
  { resource: "Project", action: "update" },
  { resource: "ProjectMember", action: "create" },
  { resource: "ProjectMember", action: "update" },
  { resource: "ProjectMember", action: "delete" },
  { resource: "Sprint", action: "create" },
  { resource: "Sprint", action: "delete" },
  { resource: "Issue", action: "delete" },
  { resource: "IssueComment", action: "delete" },
  { resource: "Doc", action: "delete" },
  { resource: "Timesheet", action: "delete" },
];

const VIEWER_GRANTS: Array<{ resource: string; action: string }> = [
  ...PROJECT_SHELL_VIEW,
];

/* ───────────────────── Field-level seed per role ───────────────────── */
// Rows are added only where a role's field deviates from the default
// (editable). Project Admin / PM stay editable across the board — no rows
// needed. Developer / QA get readonly locks on fields they shouldn't change.

type FieldRow = {
  entity: string;
  field: string;
  level: "hidden" | "readonly" | "editable" | "required";
};

const DEVELOPER_FIELD_PERMS: FieldRow[] = [
  { entity: "Issue", field: "type", level: "readonly" },
  { entity: "Issue", field: "priority", level: "readonly" },
  { entity: "Issue", field: "reporter", level: "readonly" },
  { entity: "Issue", field: "dueDate", level: "readonly" },
  { entity: "Issue", field: "parent", level: "readonly" },
  { entity: "Issue", field: "sprint", level: "readonly" },
  { entity: "Timesheet", field: "billable", level: "readonly" },
];

const QA_FIELD_PERMS: FieldRow[] = [
  { entity: "Issue", field: "title", level: "readonly" },
  { entity: "Issue", field: "description", level: "readonly" },
  { entity: "Issue", field: "type", level: "readonly" },
  { entity: "Issue", field: "priority", level: "readonly" },
  { entity: "Issue", field: "assignee", level: "readonly" },
  { entity: "Issue", field: "reporter", level: "readonly" },
  { entity: "Issue", field: "dueDate", level: "readonly" },
  { entity: "Issue", field: "startDate", level: "readonly" },
  { entity: "Issue", field: "storyPoints", level: "readonly" },
  { entity: "Issue", field: "originalEstimate", level: "readonly" },
  { entity: "Issue", field: "parent", level: "readonly" },
  { entity: "Issue", field: "sprint", level: "readonly" },
  { entity: "Timesheet", field: "billable", level: "readonly" },
];

const VIEWER_FIELD_PERMS: FieldRow[] = [];

export const STARTER_FIELD_PERMS: Record<string, FieldRow[]> = {
  "Project Admin": [],
  PM: [],
  Developer: DEVELOPER_FIELD_PERMS,
  QA: QA_FIELD_PERMS,
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
    name: "Project Admin",
    description: "Full control of this project. Auto-assigned to the creator.",
    isDefault: false,
    grants: [], // populated below — every valid pair
  },
  {
    name: "Developer",
    description: "Builds and ships issues. Default role for new project members.",
    isDefault: true,
    grants: DEVELOPER_GRANTS,
  },
  {
    name: "QA",
    description: "Tests issues and files comments. Limited write access.",
    isDefault: false,
    grants: QA_GRANTS,
  },
  {
    name: "PM",
    description: "Plans sprints and manages project membership.",
    isDefault: false,
    grants: PM_GRANTS,
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

  // Seed the 5 starter project roles + their grants. Idempotent: if a role
  // with the same name already exists for this project, skip both the role
  // create AND the grants fill (don't clobber admin edits).
  const adminAllPairs = allPermissionPairs();
  for (const tmpl of STARTER_PROJECT_ROLES) {
    const existing = await tx.qtProjectRole.findUnique({
      where: { projectId_name: { projectId, name: tmpl.name } },
      select: { id: true },
    });
    if (existing) continue;

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

    const grants = tmpl.name === "Project Admin" ? adminAllPairs : tmpl.grants;
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

/** Returns the QtProjectRole.id for the named starter role in this project. */
export async function getStarterProjectRoleId(
  tx: Prisma.TransactionClient,
  projectId: string,
  roleName: "Project Admin" | "Developer" | "QA" | "PM" | "Viewer",
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
