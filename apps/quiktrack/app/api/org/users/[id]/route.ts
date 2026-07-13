import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { assignDefaultProjectRoleIfNone } from "@/lib/services/projectDefaults";

const patchSchema = z.object({
  firstName: z.string().trim().min(1).max(64).optional(),
  lastName: z.string().trim().min(1).max(64).optional(),
  /** New password — if provided, replaces the bcrypt hash. ≥ 8 chars. */
  password: z.string().min(8).max(128).optional(),
  /** Membership status flip. */
  status: z.enum(["active", "inactive"]).optional(),
  /** Replace team membership for this user inside this org (atomic). */
  teamIds: z.array(z.string().min(1)).optional(),
  /** Replace project membership (idempotent upserts + remove-if-missing). */
  projectIds: z.array(z.string().min(1)).optional(),
});

// GET /api/org/users/[id] — admin fetches a single member's editable state:
// platform fields + status + current team ids + current project ids. Used
// to prefill the Edit User drawer.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId } = auth as { orgId: string; userId: string };

    const membership = await db.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId: params.id } },
      select: {
        status: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            lastSignInAt: true,
          },
        },
      },
    });
    if (!membership) {
      return NextResponse.json(
        { success: false, error: "User not in organisation" },
        { status: 404 },
      );
    }

    const [teamRows, projectRows] = await Promise.all([
      db.userTeam.findMany({
        where: { orgId, userId: params.id },
        select: { teamId: true },
      }),
      db.qtProjectMember.findMany({
        where: {
          userId: params.id,
          isDeleted: false,
          project: { orgId, isDeleted: false },
        },
        select: { projectId: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        ...membership.user,
        status: membership.status,
        teamIds: teamRows.map((t) => t.teamId),
        projectIds: projectRows.map((p) => p.projectId),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load user";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PATCH /api/org/users/[id] — admin updates an existing org member.
// Updates platform User fields (firstName, lastName, password) plus
// OrgMember.status, plus reconciles team and project memberships.
// Email is intentionally NOT editable — it's the login identifier and
// updating it would risk breaking existing sessions and audit trails.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId, userId: actorId } = auth as {
      orgId: string;
      userId: string;
    };

    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const { firstName, lastName, password, status, teamIds, projectIds } = parsed.data;

    // Tenant isolation: confirm the target is an org member here.
    const membership = await db.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId: params.id } },
      select: { id: true },
    });
    if (!membership) {
      return NextResponse.json(
        { success: false, error: "User not in organisation" },
        { status: 404 },
      );
    }

    // ─── User fields (platform-wide) ───
    const userPatch: {
      firstName?: string;
      lastName?: string;
      password?: string;
    } = {};
    if (firstName !== undefined) userPatch.firstName = firstName;
    if (lastName !== undefined) userPatch.lastName = lastName;
    if (password !== undefined) userPatch.password = await bcrypt.hash(password, 12);
    if (Object.keys(userPatch).length > 0) {
      await db.user.update({ where: { id: params.id }, data: userPatch });
    }

    // ─── OrgMember.status ───
    if (status !== undefined) {
      await db.orgMember.update({
        where: { id: membership.id },
        data: { status },
      });
    }

    // ─── Teams (replace set) ───
    if (teamIds !== undefined) {
      const desired = Array.from(new Set(teamIds));
      const current = await db.userTeam.findMany({
        where: { orgId, userId: params.id },
        select: { teamId: true },
      });
      const currentSet = new Set(current.map((r) => r.teamId));
      const desiredSet = new Set(desired);
      const toAdd = desired.filter((t) => !currentSet.has(t));
      const toRemove = [...currentSet].filter((t) => !desiredSet.has(t));
      await db.$transaction([
        ...toRemove.map((teamId) =>
          db.userTeam.delete({
            where: {
              orgId_userId_teamId: { orgId, userId: params.id, teamId },
            },
          }),
        ),
        ...toAdd.map((teamId) =>
          db.userTeam.create({ data: { orgId, userId: params.id, teamId } }),
        ),
      ]);
    }

    // ─── Projects (reconcile QtProjectMember) ───
    if (projectIds !== undefined) {
      const valid = await db.qtProject.findMany({
        where: { id: { in: projectIds }, orgId, isDeleted: false },
        select: { id: true },
      });
      const desiredSet = new Set(valid.map((p) => p.id));
      const current = await db.qtProjectMember.findMany({
        where: {
          userId: params.id,
          isDeleted: false,
          project: { orgId, isDeleted: false },
        },
        select: { id: true, projectId: true },
      });
      const toAdd = [...desiredSet].filter(
        (id) => !current.some((c) => c.projectId === id),
      );
      const toSoftDelete = current
        .filter((c) => !desiredSet.has(c.projectId))
        .map((c) => c.id);

      await db.$transaction([
        ...(toSoftDelete.length > 0
          ? [
              db.qtProjectMember.updateMany({
                where: { id: { in: toSoftDelete } },
                data: { isDeleted: true },
              }),
            ]
          : []),
        ...toAdd.map((projectId) =>
          db.qtProjectMember.upsert({
            where: { projectId_userId: { projectId, userId: params.id } },
            update: { isDeleted: false },
            create: {
              projectId,
              userId: params.id,
              role: "MEMBER",
              invitedBy: actorId,
            },
          }),
        ),
      ]);

      // Newly-added memberships get the project's default role so they don't
      // land "Unassigned" (same fallback the Add-Member and user-creation flows
      // apply). Runs after the tx commits — the helper uses the base client.
      for (const projectId of toAdd) {
        await assignDefaultProjectRoleIfNone(projectId, params.id, actorId);
      }
    }

    const updated = await db.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        lastSignInAt: true,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update user";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
