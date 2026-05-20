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
 * - **Project Admin** — every pair in the tree (auto-assigned to creator).
 * - **Developer** *(isDefault)* — full Issue / Comment CRUD, Sprint update,
 *   Doc view/update, Timesheet create/update.
 * - **QA** — Issue view+update, IssueComment create+update, Sprint view.
 * - **PM** — Developer's set + Sprint create/delete, ProjectMember CRUD,
 *   Project update.
 * - **Viewer** — view-only on Issue / IssueComment / Sprint / Board.
 */
const DEVELOPER_GRANTS: Array<{ resource: string; action: string }> = [
  { resource: "Issue", action: "view" },
  { resource: "Issue", action: "create" },
  { resource: "Issue", action: "update" },
  { resource: "Issue", action: "delete" },
  { resource: "IssueComment", action: "view" },
  { resource: "IssueComment", action: "create" },
  { resource: "IssueComment", action: "update" },
  { resource: "Sprint", action: "view" },
  { resource: "Sprint", action: "update" },
  { resource: "Doc", action: "view" },
  { resource: "Doc", action: "update" },
  { resource: "Timesheet", action: "view" },
  { resource: "Timesheet", action: "create" },
  { resource: "Timesheet", action: "update" },
];

const QA_GRANTS: Array<{ resource: string; action: string }> = [
  { resource: "Issue", action: "view" },
  { resource: "Issue", action: "update" },
  { resource: "IssueComment", action: "view" },
  { resource: "IssueComment", action: "create" },
  { resource: "IssueComment", action: "update" },
  { resource: "Sprint", action: "view" },
];

const PM_GRANTS: Array<{ resource: string; action: string }> = [
  ...DEVELOPER_GRANTS,
  { resource: "Sprint", action: "create" },
  { resource: "Sprint", action: "delete" },
  { resource: "ProjectMember", action: "view" },
  { resource: "ProjectMember", action: "create" },
  { resource: "ProjectMember", action: "update" },
  { resource: "ProjectMember", action: "delete" },
  { resource: "Project", action: "update" },
];

const VIEWER_GRANTS: Array<{ resource: string; action: string }> = [
  { resource: "Issue", action: "view" },
  { resource: "IssueComment", action: "view" },
  { resource: "Sprint", action: "view" },
  { resource: "Board", action: "view" },
];

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
