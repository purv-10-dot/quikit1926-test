import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/withAuth";
import { isOrgAdmin, type Role } from "@/lib/rbac";

// QuikInsight offers exactly two assignable roles. The legacy names stay
// readable in lib/rbac.ts (existing rows carry them) but cannot be assigned.
const ROLES: Role[] = ["ADMIN", "VIEWER"];
// Both are org-wide and carry no team, so no team is ever required here.
const ORG_WIDE: Role[] = ["ADMIN", "VIEWER"];

// PATCH /api/admin/users/[id]/role — set a user's single role assignment.
// Body: { role: Role; teamId: string | null }
// Guarded to org admins (SUPER_ADMIN) via isOrgAdmin.
export const PATCH = withAuth(async (req, ctx) => {
  if (!isOrgAdmin(req.session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = ctx.params?.id;
  if (typeof userId !== "string" || !userId) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }

  
  let role: Role;
  let teamId: string | null;
  try {
    const body = (await req.json()) as { role?: unknown; teamId?: unknown };
    if (!ROLES.includes(body.role as Role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    role = body.role as Role;
    teamId = body.teamId == null || body.teamId === "" ? null : String(body.teamId);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Org-wide roles must not be scoped to a team; team roles must have one.
  if (ORG_WIDE.includes(role)) {
    teamId = null;
  } else if (!teamId) {
    return NextResponse.json({ error: "A team is required for this role" }, { status: 400 });
  }

  // Guard against an admin locking themselves out of the admin surface.
  if (userId === req.session.user.id && role !== "ADMIN") {
    return NextResponse.json({ error: "You can't change your own admin role" }, { status: 400 });
  }

  // Validate FKs up front for clean 400s instead of raw Prisma errors.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (teamId) {
    const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  // The admin UI models one effective role per user, so replace any existing
  // assignments with the new single grant, atomically.
  try {
    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { userId } }),
      prisma.userRole.create({ data: { userId, role, teamId } }),
    ]);
  } catch {
    return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, role, teamId });
}, /* org-admin gate applied in-handler */ undefined);
