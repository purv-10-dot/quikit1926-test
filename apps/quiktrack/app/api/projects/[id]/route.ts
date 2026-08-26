import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { forbidden, isProjectSpaceAdmin } from "@/lib/api/permissions";
import { updateProjectSchema } from "@/lib/validation/project";
import { listStarredProjectIds } from "@/lib/services/projectStars";
import { getSpaceBackground } from "@/lib/services/spaceBackground";

/**
 * Read/write the QtProject.tabConfig column via raw SQL. The generated Prisma
 * client can't be regenerated locally (the dev server holds the query-engine
 * DLL), so it doesn't yet know this column — raw SQL is the safe path until the
 * integration owner regenerates the client in CI.
 */
async function readTabConfig(orgId: string, projectId: string): Promise<string[] | null> {
  const rows = await db.$queryRaw<{ tabConfig: string[] | null }[]>`
    SELECT "tabConfig" FROM "app_quiktrack"."QtProject"
    WHERE "id" = ${projectId} AND "orgId" = ${orgId}
    LIMIT 1
  `;
  return rows[0]?.tabConfig ?? null;
}

export const GET = withProjectAccess<{ id: string }>(
  async ({ orgId, userId, projectId, isTenantAdmin }) => {
    const project = await db.qtProject.findFirst({
      where: { id: projectId, orgId: orgId, isDeleted: false },
      include: {
        statuses: {
          where: { isDeleted: false },
          orderBy: { orderIndex: "asc" },
        },
        issueTypes: { where: { isDeleted: false }, orderBy: { orderIndex: "asc" } },
      },
    });
    // tabConfig and background both live on QtProject but the generated Prisma
    // client is stale (can't be regenerated while the dev server holds the
    // engine DLL), so read those columns raw and merge them into the response.
    // Two lifecycle capabilities drive the settings "Danger zone" AND the
    // header's "..." menu:
    //   • canArchive — global admins AND this space's Space Admin (archive is a
    //     project-owner action).
    //   • isAdmin    — global admins only (move-to-trash / restore).
    // The client hides buttons accordingly; the routes still enforce both.
    // `starred` is per-user (QtProjectStar) and drives the menu's
    // "Add to starred" / "Remove from starred" toggle without a second fetch.
    const [tabConfig, canArchive, starredIds, background] = await Promise.all([
      readTabConfig(orgId, projectId),
      isTenantAdmin
        ? Promise.resolve(true)
        : isProjectSpaceAdmin(userId, projectId),
      listStarredProjectIds(orgId, userId),
      getSpaceBackground(orgId, projectId),
    ]);
    return NextResponse.json({
      success: true,
      data: project
        ? {
            ...project,
            tabConfig,
            background,
            isAdmin: isTenantAdmin,
            canArchive,
            starred: starredIds.includes(projectId),
          }
        : project,
    });
  },
  { paramKey: "id" },
);

export const PATCH = withProjectAccess<{ id: string }>(
  async ({ orgId, userId, projectId, isTenantAdmin }, req) => {
    const parsed = updateProjectSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }

    // Archiving / unarchiving (a status change) is a project-owner action:
    // allowed for global admins and this space's Space Admin, but NOT for a
    // regular Project:update holder (who may still edit name/icon/etc.).
    if (
      parsed.data.status !== undefined &&
      !isTenantAdmin &&
      !(await isProjectSpaceAdmin(userId, projectId))
    ) {
      return forbidden();
    }

    try {
      // The space key is immutable — it's embedded in every work-item ID, so
      // changing it would orphan existing references. Strip any incoming
      // projectKey so it can never be updated, even via a crafted request.
      // tabConfig is pulled out too: the stale client doesn't know that column,
      // so it's persisted via raw SQL below (validated already by the schema).
      const { projectKey: _immutableKey, tabConfig, ...updatable } = parsed.data;
      void _immutableKey; // intentionally discarded (immutable key)
      // withProjectAccess has already verified this user can edit this
      // project in this org, so the unique-id where is safe to use directly.
      const project = await db.qtProject.update({
        where: { id: projectId },
        data: {
          ...updatable,
          startDate: updatable.startDate ? new Date(updatable.startDate) : undefined,
          endDate: updatable.endDate ? new Date(updatable.endDate) : undefined,
          updatedBy: userId,
        },
      });
      if (tabConfig !== undefined) {
        const json = tabConfig === null ? null : JSON.stringify(tabConfig);
        await db.$executeRaw`
          UPDATE "app_quiktrack"."QtProject"
          SET "tabConfig" = ${json}::jsonb, "updatedBy" = ${userId}
          WHERE "id" = ${projectId} AND "orgId" = ${orgId}
        `;
      }
      const finalTabConfig = await readTabConfig(orgId, projectId);
      return NextResponse.json({ success: true, data: { ...project, tabConfig: finalTabConfig } });
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      if (code === "P2002") {
        const target = (error as { meta?: { target?: string[] } })?.meta?.target ?? [];
        if (target.includes("projectKey")) {
          return NextResponse.json(
            { success: false, error: "This space key is already in use. Choose a different one." },
            { status: 409 },
          );
        }
        return NextResponse.json(
          { success: false, error: "A space with these details already exists." },
          { status: 409 },
        );
      }
      const message = error instanceof Error ? error.message : "Failed to update space";
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { paramKey: "id", requirePermission: { resource: "Project", action: "update" } },
);

// Move a project to trash (soft-delete). ADMIN-ONLY: only org owners/admins and
// QuikTrack app-admins may trash a project — a project-scoped Space Admin cannot.
// isTenantAdmin is true only for those global admins, so we gate on it directly
// instead of the Project:delete permission grant.
export const DELETE = withProjectAccess<{ id: string }>(
  async ({ userId, projectId, isTenantAdmin }) => {
    if (!isTenantAdmin) return forbidden();
    await db.qtProject.update({
      where: { id: projectId },
      data: { isDeleted: true, updatedBy: userId },
    });
    return NextResponse.json({ success: true, data: { id: projectId } });
  },
  { paramKey: "id" },
);
