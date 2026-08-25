import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { getQuikFlowAppId } from "@/lib/api/permissions";

// RBAC v2: gated by the `Role` resource — this endpoint exists only to
// populate the "assign members" picker in the Roles & Permissions tab.
const auth = withOrgAuthForResource("Role");

// GET /api/org/users — users who have QuikFlow access in this org
// (app_quikit.UserAppAccess for the QuikFlow app), for the role-members
// picker. Users who only have access to other QuikIT apps but not QuikFlow
// are intentionally excluded — assigning them a QuikFlow role would be
// meaningless until they're granted app access.
export const GET = auth.view(async ({ orgId }) => {
  const appId = await getQuikFlowAppId();
  if (!appId) {
    return NextResponse.json({ success: false, error: "QuikFlow app not registered" }, { status: 500 });
  }

  const access = await db.userAppAccess.findMany({
    where: { orgId, appId },
    select: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { user: { firstName: "asc" } },
  });

  const users = access.map((a) => ({
    userId: a.user.id,
    firstName: a.user.firstName,
    lastName: a.user.lastName,
    email: a.user.email,
  }));

  return NextResponse.json({ success: true, data: users });
}, { fallbackErrorMessage: "Failed to list users" });
