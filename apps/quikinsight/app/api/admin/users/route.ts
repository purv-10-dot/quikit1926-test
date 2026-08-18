import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/withAuth";
import { sessionRole, isOrgAdmin } from "@/lib/rbac";

// GET /api/admin/users — all users with their role assignments and team names.
// Restricted to org admins (SUPER_ADMIN) via isOrgAdmin.
export const GET = withAuth(async (req) => {
  if (!isOrgAdmin(sessionRole(req.session))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id:        true,
      email:     true,
      name:      true,
      createdAt: true,
      userRoles: {
        select: {
          role: true,
          team: { select: { id: true, name: true } },
        },
      },
    },
  });

  // Flatten role assignments to { role, teamId, teamName } — teamName is null
  // for org-wide grants (SUPER_ADMIN / MANAGEMENT have no team).
  const result = users.map((u) => ({
    id:        u.id,
    email:     u.email,
    name:      u.name,
    createdAt: u.createdAt,
    roles: u.userRoles.map((r) => ({
      role:     r.role,
      teamId:   r.team?.id ?? null,
      teamName: r.team?.name ?? null,
    })),
  }));

  return NextResponse.json({ users: result });
}, /* no static permission — org-admin gate is applied in-handler */ undefined);
