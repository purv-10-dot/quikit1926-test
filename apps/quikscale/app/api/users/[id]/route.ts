import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

// GET /api/users/[id]
// Resolve a single ACTIVE org member by user id, scoped to the caller's org.
//
// Used by the owner/who FilterPicker on KPI / Priority / WWW to display the
// name + avatar of an APPLIED owner filter even when that user isn't in the
// loaded 25-user page AND the filtered list is empty (0 rows). Without this,
// the picker fell back to "All owners" while a filter was actually active —
// the list showed "1 filter" and 0 items, but the picker named nobody.
//
// Tenant isolation is enforced by the `orgId` filter: a user id from another
// org (or one that isn't an active member here) resolves to 404, never leaks.
export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId }, _request, { params }) => {
    const member = await db.orgMember.findFirst({
      where: { orgId, userId: params.id, status: "active" },
      select: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    if (!member?.user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: member.user });
  },
  { fallbackErrorMessage: "Failed to fetch user" },
);
