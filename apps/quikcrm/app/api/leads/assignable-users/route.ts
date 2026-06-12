import { NextResponse } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { getAssignableUsers } from "@/lib/services/leads/lead-assignment";

export const runtime = "nodejs";

/**
 * GET /api/leads/assignable-users
 *
 * Returns the list of users the caller is permitted to assign as lead owner,
 * filtered by role:
 *   Administrator  → all active org members
 *   SalesManager   → self + members/co-managers of managed groups
 *   SalesUser      → self only
 *   MarketingUser  → [] (empty — cannot assign)
 *   FinanceUser    → [] (empty — cannot assign)
 *
 * Used to populate the Lead Owner dropdown in the create/edit form.
 */
export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "leads", "view");

    const users = await getAssignableUsers(user);
    return NextResponse.json({ success: true, data: users });
  } catch (e) {
    return errorResponse(e);
  }
}
