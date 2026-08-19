import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { createProjectSchema } from "@/lib/validation/project";
import {
  seedProjectDefaults,
  getStarterProjectRoleId,
} from "@/lib/services/projectDefaults";
import { seedDiscoveryDefaults } from "@/lib/services/discoveryDefaults";
import { userCan, forbidden, isQuikTrackAppAdmin } from "@/lib/api/permissions";
import { SPACE_ADMIN_ROLE_NAME } from "@/lib/api/permissionsRegistry";
import { PROJECT_TAB_PATHS } from "@/lib/projectTabs";
import { listStarredProjectIds } from "@/lib/services/projectStars";

// The "functional" (Kanban) template starts with Epics, List and Task Table
// hidden — a Space Admin can re-enable them later via the tab customizer (+).
// Every other template shows all tabs (tabConfig = null).
const KANBAN_HIDDEN_TABS = ["epics", "list", "task-table"];

// Which slice of the project list to return. Drives the visibility model:
//   "active"   → live projects (default; what everyone browses)
//   "archived" → status="archived" but not trashed (a separate list; members
//                keep access, unarchive brings them back to "active")
//   "trash"    → soft-deleted (isDeleted=true). ADMIN-ONLY — the recovery bin.
const PROJECT_VIEWS = ["active", "archived", "trash"] as const;
type ProjectView = (typeof PROJECT_VIEWS)[number];

// AI Runtime: agent-JWT opt-in (manifest read op `list_projects`). Reads only —
// the POST below deliberately stays session/API-token.
export const GET = withOrgAuth(async ({ orgId, userId }, req) => {
  const url = new URL(req.url);
  const search = url.searchParams.get("search")?.trim() || "";
  const filterParam = url.searchParams.get("filter") || "";
  const filterTypes = filterParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const keysParam = url.searchParams.get("keys") || "";
  const filterKeys = keysParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const sort = (url.searchParams.get("sort") || "name") as "name" | "updatedAt";
  const order = (url.searchParams.get("order") || "asc") as "asc" | "desc";
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const rawPageSize = Number(url.searchParams.get("pageSize") || 0);
  const pageSize = rawPageSize > 0 ? Math.min(100, rawPageSize) : 0; // 0 = no pagination
  const viewParam = url.searchParams.get("view") || "active";
  const view: ProjectView = PROJECT_VIEWS.includes(viewParam as ProjectView)
    ? (viewParam as ProjectView)
    : "active";

  const orgAdmin = await db.orgMember.findFirst({
    where: { userId, orgId, status: "active" },
    select: { role: true },
  });
  // Org owners/admins AND QuikTrack app-admins see every space in the org;
  // everyone else sees only spaces they're a member of. This is the SAME admin
  // definition withProjectAccess uses to gate delete/restore, so "can see the
  // trash" == "can restore from it".
  const isAdmin =
    orgAdmin?.role === "admin" ||
    orgAdmin?.role === "owner" ||
    (await isQuikTrackAppAdmin(userId, orgId));

  // The trash is admin-only — never leak soft-deleted projects to members.
  if (view === "trash" && !isAdmin) return forbidden();

  // Trash = soft-deleted regardless of status; the other views exclude deleted
  // and split on status so archived projects drop out of the default list.
  const where: Record<string, unknown> =
    view === "trash"
      ? { orgId, isDeleted: true }
      : { orgId, isDeleted: false, status: view === "archived" ? "archived" : "active" };
  if (!isAdmin && view !== "trash") {
    where.members = { some: { userId, isDeleted: false } };
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { projectKey: { contains: search, mode: "insensitive" } },
    ];
  }
  if (filterTypes.length > 0) {
    where.projectType = { in: filterTypes };
  }
  if (filterKeys.length > 0) {
    where.projectKey = { in: filterKeys };
  }

  const orderBy = sort === "name" ? { name: order } : { updatedAt: order };

  const total = await db.qtProject.count({ where });

  const projects = await db.qtProject.findMany({
    where,
    orderBy,
    skip: pageSize > 0 ? (page - 1) * pageSize : 0,
    take: pageSize > 0 ? pageSize : undefined,
    select: {
      id: true,
      name: true,
      projectKey: true,
      icon: true,
      color: true,
      projectType: true,
      templateKey: true,
      status: true,
      leadUserId: true,
      updatedAt: true,
    },
  });

  // `managementStyle` is a newly-added column the stale dev Prisma client can't
  // `select`, so fetch it with a raw query and merge by id. (Safe: ids come from
  // the org-scoped `findMany` above, not user input.)
  let styleById = new Map<string, string>();
  if (projects.length > 0) {
    const rows = await db.$queryRawUnsafe<
      { id: string; managementStyle: string | null }[]
    >(
      `SELECT id, "managementStyle" FROM app_quiktrack."QtProject" WHERE id IN (${projects
        .map((_, i) => `$${i + 1}`)
        .join(", ")})`,
      ...projects.map((p) => p.id),
    );
    styleById = new Map(rows.map((r) => [r.id, r.managementStyle ?? "team-managed"]));
  }

  // Per-user starred set — drives the list's star toggle + the sidebar's
  // "Starred" group. Raw SQL (stale client doesn't know QtProjectStar).
  const starredIds = new Set(await listStarredProjectIds(orgId, userId));

  const leadIds = Array.from(
    new Set(
      projects
        .map((p) => p.leadUserId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const leads = leadIds.length
    ? await db.user.findMany({
        where: { id: { in: leadIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatar: true,
        },
      })
    : [];
  const leadById = new Map(leads.map((u) => [u.id, u] as const));

  // Per-project archive capability: global admins can archive anything; a
  // non-admin can archive only the spaces where they hold the Space Admin role.
  // (Move-to-trash stays global-admin-only — see the top-level `isAdmin`.)
  let spaceAdminIds = new Set<string>();
  if (!isAdmin && projects.length > 0) {
    const sa = await db.qtProjectUserRole.findMany({
      where: {
        userId,
        projectId: { in: projects.map((p) => p.id) },
        projectRole: { name: SPACE_ADMIN_ROLE_NAME },
      },
      select: { projectId: true },
    });
    spaceAdminIds = new Set(sa.map((r) => r.projectId));
  }

  const data = projects.map((p) => ({
    ...p,
    managementStyle: styleById.get(p.id) ?? "team-managed",
    starred: starredIds.has(p.id),
    lead: p.leadUserId ? leadById.get(p.leadUserId) ?? null : null,
    canArchive: isAdmin || spaceAdminIds.has(p.id),
  }));

  return NextResponse.json({
    success: true,
    data,
    total,
    page,
    pageSize: pageSize || total,
    totalPages: pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1,
    // Lets the client show/hide admin-only lifecycle controls (Move to trash,
    // Restore, the Trash tab). The server still enforces every action.
    isAdmin,
  });
}, { allowAgentJwt: true });

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  if (!(await userCan(userId, orgId, "Project", "create"))) return forbidden();
  const parsed = createProjectSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(", "),
      },
      { status: 400 },
    );
  }

  const dup = await db.qtProject.findFirst({
    where: { orgId, projectKey: parsed.data.projectKey, isDeleted: false },
    select: { id: true },
  });
  if (dup) {
    return NextResponse.json(
      {
        success: false,
        error: `Project key "${parsed.data.projectKey}" already exists`,
      },
      { status: 409 },
    );
  }

  const templateKey = parsed.data.templateKey ?? "scrum";
  // A discovery space defaults its projectType to "discovery" (the label the UI
  // already renders) unless the caller overrode it explicitly.
  const projectType =
    parsed.data.projectType ??
    (templateKey === "discovery" ? "discovery" : "software");
  const managementStyle = parsed.data.managementStyle ?? "team-managed";
  // Functional/Kanban projects open with a curated tab set; discovery spaces
  // show only the "Ideas" tab (their whole surface); others show all.
  const initialTabConfig =
    templateKey === "discovery"
      ? ["ideas"]
      : templateKey === "functional"
        ? PROJECT_TAB_PATHS.filter((path) => !KANBAN_HIDDEN_TABS.includes(path))
        : null;

  const project = await db.$transaction(
    async (tx) => {
      const p = await tx.qtProject.create({
        data: {
          orgId,
          projectKey: parsed.data.projectKey,
          name: parsed.data.name,
          description: parsed.data.description,
          projectType,
          templateKey,
          ...(initialTabConfig ? { tabConfig: initialTabConfig } : {}),
          icon: parsed.data.icon,
          color: parsed.data.color ?? "#2563eb",
          startDate: parsed.data.startDate
            ? new Date(parsed.data.startDate)
            : null,
          endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
          leadUserId: parsed.data.leadUserId ?? userId,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      // The generated Prisma client on this dev box is stale and doesn't yet
      // know the `managementStyle` column, so we can't pass it to `create`.
      // Set it with a raw UPDATE in the same transaction. Only write when the
      // caller picked the non-default so existing rows keep their DB default.
      if (managementStyle && managementStyle !== "team-managed") {
        await tx.$executeRawUnsafe(
          `UPDATE app_quiktrack."QtProject" SET "managementStyle" = $1 WHERE id = $2`,
          managementStyle,
          p.id,
        );
      }
      await tx.qtProjectMember.create({
        data: {
          projectId: p.id,
          userId,
          role: "PROJECT_ADMIN",
          invitedBy: userId,
        },
      });
      await seedProjectDefaults(tx, p.id, orgId, userId);
      // Discovery spaces get their idea funnel statuses, scoring fields, and the
      // default "All ideas" Table view on top of the shared defaults — all in
      // this same transaction so provisioning is atomic (FR-1.2).
      if (templateKey === "discovery") {
        await seedDiscoveryDefaults(tx, p.id, orgId, userId);
      }
      // Assign the creator the seeded "Space Admin" project role so Layer 2
      // grants are populated alongside Layer 3 membership.
      const adminRoleId = await getStarterProjectRoleId(
        tx,
        p.id,
        "Space Admin",
      );
      if (adminRoleId) {
        await tx.qtProjectUserRole.create({
          data: {
            projectId: p.id,
            userId,
            projectRoleId: adminRoleId,
            assignedBy: userId,
          },
        });
      }
      return p;
    },
    // Seeding fans out into many sequential inserts (statuses, issue types, and
    // the 3 starter roles with their permission + field-permission grants). On a
    // remote DB (Neon) each insert is a network round-trip, which can overrun
    // Prisma's default 5s interactive-transaction window. Give it headroom.
    { timeout: 20_000, maxWait: 5_000 },
  );

  return NextResponse.json({ success: true, data: project }, { status: 201 });
}, { allowAgentJwt: true });
