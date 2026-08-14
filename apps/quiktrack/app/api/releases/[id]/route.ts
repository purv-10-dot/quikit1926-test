import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, userCanInProject } from "@/lib/api/permissions";
import { updateReleaseSchema } from "@/lib/validation/release";

async function loadRelease(id: string, orgId: string) {
  return db.qtRelease.findFirst({
    where: { id, isDeleted: false, project: { orgId, isDeleted: false } },
    include: {
      approvers: { orderBy: { createdAt: "asc" } },
      relatedLinks: { orderBy: { createdAt: "asc" } },
      _count: { select: { issues: true } },
    },
  });
}

async function userCanView(userId: string, orgId: string, projectId: string) {
  if (await hasAdminAccess(userId, orgId)) return true;
  const member = await db.qtProjectMember.findFirst({
    where: { projectId, userId, isDeleted: false },
    select: { id: true },
  });
  return !!member;
}

async function userCanEdit(userId: string, orgId: string, projectId: string) {
  if (await hasAdminAccess(userId, orgId)) return true;
  return userCanInProject(userId, orgId, projectId, "Release", "update");
}

export const GET = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const release = await loadRelease(params.id, orgId);
  if (!release) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  if (!(await userCanView(userId, orgId, release.projectId))) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: release });
});

export const PATCH = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const release = await loadRelease(params.id, orgId);
    if (!release) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (!(await userCanEdit(userId, orgId, release.projectId))) {
      return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
    }
    const parsed = updateReleaseSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const { name, description, startDate, releaseDate, driverId, status } = parsed.data;
    const now = new Date();
    const updated = await db.qtRelease.update({
      where: { id: release.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description: description || null } : {}),
        ...(startDate !== undefined
          ? { startDate: startDate ? new Date(startDate) : null }
          : {}),
        ...(releaseDate !== undefined
          ? { releaseDate: releaseDate ? new Date(releaseDate) : null }
          : {}),
        ...(driverId !== undefined ? { driverId: driverId || null } : {}),
        ...(status !== undefined
          ? {
              status,
              releasedAt: status === "RELEASED" ? now : release.releasedAt,
              archivedAt: status === "ARCHIVED" ? now : release.archivedAt,
            }
          : {}),
        updatedBy: userId,
      },
    });
    return NextResponse.json({ success: true, data: updated });
  },
);

export const DELETE = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const release = await loadRelease(params.id, orgId);
    if (!release) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (!(await userCanEdit(userId, orgId, release.projectId))) {
      return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
    }
    await db.qtRelease.update({
      where: { id: release.id },
      data: { isDeleted: true, updatedBy: userId },
    });
    return NextResponse.json({ success: true });
  },
);
