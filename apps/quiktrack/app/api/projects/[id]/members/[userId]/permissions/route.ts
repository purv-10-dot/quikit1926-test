import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";

// GET /api/projects/[id]/members/[userId]/permissions
// Returns the user's effective permissions inside this project:
//   - roleGrants: from their assigned QtProjectRole (via QtProjectUserRole)
//   - extras: not project-scoped today; reserved for future per-user extras
// The Effective Permissions UI in the Users tab uses this to show which
// cells are "from the role" (locked) vs editable.
export const GET = withProjectAccess<{ id: string; userId: string }>(async (
  { projectId },
  _req,
  { params },
) => {
  const member = await db.qtProjectMember.findFirst({
    where: { projectId, userId: params.userId, isDeleted: false },
    select: { userId: true },
  });

  if (!member) {
    return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });
  }

  const assignment = await db.qtProjectUserRole.findUnique({
    where: { projectId_userId: { projectId, userId: params.userId } },
    select: {
      projectRoleId: true,
      projectRole: {
        select: {
          id: true,
          name: true,
          permissions: { select: { resource: true, action: true } },
        },
      },
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      userId: member.userId,
      roleId: assignment?.projectRoleId ?? null,
      roleName: assignment?.projectRole?.name ?? null,
      roleGrants: assignment?.projectRole?.permissions ?? [],
    },
  });
}, { paramKey: "id" });
