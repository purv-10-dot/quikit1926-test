import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureLinkedEmployee } from "@/lib/api/employeeLink";

/**
 * Resolve an assignee reference to the backing AstEmployee.id that assignment
 * and replacement rows FK to (AstAssignment.userId / AstReplacement.userId →
 * AstEmployee.id).
 *
 * The Assign / Assign-Replacement pickers now source from the merged User
 * Management list (/api/org/users), so they send a PLATFORM User.id. We look
 * that user up, guarantee a linked AstEmployee — auto-creating the identity
 * bridge on first assignment via ensureLinkedEmployee — and return its id.
 *
 * Fallback: a ref that isn't an org member is treated as an existing
 * AstEmployee.id. Two callers rely on this: the repairs auto-fill path reuses
 * the original assignment's employee id, and legacy demo employees have no
 * platform link. Both lookups are orgId-scoped, and User.id / AstEmployee.id
 * are independently generated cuids that never collide, so the dual
 * interpretation is unambiguous.
 *
 * Returns { employeeId } on success, or { error } (a ready-to-return response).
 */
export async function resolveAssigneeEmployeeId(args: {
  orgId: string;
  ref: string;
}): Promise<{ employeeId: string } | { error: NextResponse }> {
  const { orgId, ref } = args;

  // Primary: treat ref as a platform User.id (what the merged pickers send).
  const member = await db.orgMember.findFirst({
    where: { orgId, userId: ref },
    select: {
      status: true,
      user: { select: { firstName: true, lastName: true, email: true } },
    },
  });
  if (member?.user) {
    if (member.status !== "active") {
      return {
        error: NextResponse.json(
          { success: false, error: "That user is no longer active in this organization." },
          { status: 409 },
        ),
      };
    }
    const name = `${member.user.firstName ?? ""} ${member.user.lastName ?? ""}`.trim() || member.user.email;
    const ensured = await ensureLinkedEmployee({ orgId, userId: ref, email: member.user.email, name });
    if (!ensured) {
      return {
        error: NextResponse.json(
          { success: false, error: "That user's email is already linked to a different employee record." },
          { status: 409 },
        ),
      };
    }
    const emp = await db.astEmployee.findFirst({ where: { orgId, userId: ref }, select: { id: true } });
    if (!emp) {
      return {
        error: NextResponse.json(
          { success: false, error: "Failed to resolve the employee record for that user." },
          { status: 500 },
        ),
      };
    }
    return { employeeId: emp.id };
  }

  // Fallback: an existing AstEmployee.id (repairs auto-fill / legacy employees).
  const emp = await db.astEmployee.findFirst({ where: { id: ref, orgId }, select: { id: true } });
  if (emp) return { employeeId: emp.id };

  return { error: NextResponse.json({ success: false, error: "Not found" }, { status: 404 }) };
}
