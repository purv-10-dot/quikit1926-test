import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { getTeamOwnerCandidateIds } from "@/lib/api/criticalNumberValidation";

/**
 * Owner candidates for one team, for the create form's Owner dropdown.
 *
 * Why this exists rather than `/api/users?teamId=…`: that endpoint filters
 * `OrgMember.teamId`, which is a single "primary team" pointer and a different
 * notion of membership from the one `validateOwnerInTeam` enforces. Measured on
 * live data, filtering that way would have dropped the team head on 10 of 12
 * teams and every member whose primary team is elsewhere — the dropdown would
 * hide owners the API accepts, and on some teams (Operations Team, Account
 * Management) it returned an empty list entirely.
 *
 * So this reads `getTeamOwnerCandidateIds` — the same function POST/PATCH
 * validate against — and the two cannot drift.
 */
const auth = withOrgAuthForResource("criticalNumbers", "CriticalNumber");

/** GET /api/critical-numbers/team-members?teamId=… */
export const GET = auth.view(async ({ orgId }, req: NextRequest) => {
  const teamId = req.nextUrl.searchParams.get("teamId");
  if (!teamId) {
    return NextResponse.json({ success: false, error: "teamId is required" }, { status: 400 });
  }

  const candidateIds = await getTeamOwnerCandidateIds(orgId, teamId);
  if (candidateIds.length === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  // Shaped for `PickerUser`, the same fields page.tsx maps onto the picker.
  //
  // Deactivated users are excluded — "active" meaning an active OrgMember row
  // in this org, the same definition /api/users uses (the User model itself has
  // no active/deleted flag). This makes the dropdown deliberately NARROWER than
  // what POST/PATCH accept: `validateOwnerInTeam` doesn't consult membership
  // status, so a deactivated member is still a valid owner as far as the API is
  // concerned. Narrower is the safe direction — the form can't offer someone
  // the API would reject — but it does mean the two are no longer identical,
  // which is why the status filter lives here and NOT in
  // `getTeamOwnerCandidateIds`: putting it there would silently start rejecting
  // deactivated owners on write.
  const users = await db.user.findMany({
    where: {
      id: { in: candidateIds },
      memberships: { some: { orgId, status: "active" } },
    },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });

  return NextResponse.json({ success: true, data: users });
});
