/**
 * Identity-bridge helpers shared by the org-users create (POST) and update
 * (PATCH) flows: link/create the AstEmployee that backs a login User
 * (AstEmployee.userId → User), and generate per-org employee ids.
 */
import { db } from "@/lib/db";

export type EmployeeFields = {
  employeeId: string;
  contact: string | null;
  department: string | null;
  designation: string | null;
  joiningDate: string | null;
  status: string;
};

export function toEmployeeFields(e: EmployeeFields): EmployeeFields {
  return {
    employeeId: e.employeeId,
    contact: e.contact,
    department: e.department,
    designation: e.designation,
    joiningDate: e.joiningDate,
    status: e.status,
  };
}

/** Next per-org employee id (EMP-####), one past the highest numeric suffix in
 *  use. Skips any id already taken so it never collides. */
export async function generateEmployeeId(orgId: string): Promise<string> {
  const rows = await db.astEmployee.findMany({ where: { orgId }, select: { employeeId: true } });
  const existing = new Set(rows.map((r) => r.employeeId));
  let max = 0;
  for (const id of existing) {
    const m = id.match(/(\d+)\s*$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  let n = max + 1;
  let candidate = `EMP-${String(n).padStart(4, "0")}`;
  while (existing.has(candidate)) {
    n += 1;
    candidate = `EMP-${String(n).padStart(4, "0")}`;
  }
  return candidate;
}

/**
 * Guarantee the user has a linked AstEmployee. Order:
 *   1. Already linked to this user → keep it.
 *   2. An employee with this email exists but is unlinked → link it (fill blanks).
 *   3. Otherwise → create one (auto-gen employeeId when not supplied).
 * Returns the employee's directory fields, or null if the email is already
 * linked to a *different* user (we never steal another user's employee).
 */
export async function ensureLinkedEmployee(args: {
  orgId: string;
  userId: string;
  email: string;
  name: string;
  employeeId?: string;
  contact?: string;
  department?: string;
  designation?: string;
  joiningDate?: string;
}): Promise<EmployeeFields | null> {
  const { orgId, userId, email, name } = args;

  const linked = await db.astEmployee.findFirst({ where: { orgId, userId } });
  if (linked) return toEmployeeFields(linked);

  const byEmail = await db.astEmployee.findFirst({
    where: { orgId, email: { equals: email, mode: "insensitive" } },
  });
  if (byEmail) {
    if (byEmail.userId && byEmail.userId !== userId) return null;
    const updated = await db.astEmployee.update({
      where: { id: byEmail.id },
      data: {
        userId,
        contact: byEmail.contact ?? args.contact ?? null,
        department: byEmail.department ?? args.department ?? null,
        designation: byEmail.designation ?? args.designation ?? null,
        joiningDate: byEmail.joiningDate ?? args.joiningDate ?? null,
      },
    });
    return toEmployeeFields(updated);
  }

  const employeeId = args.employeeId?.trim() || (await generateEmployeeId(orgId));
  const created = await db.astEmployee.create({
    data: {
      orgId,
      userId,
      employeeId,
      name,
      email,
      contact: args.contact ?? null,
      department: args.department ?? null,
      designation: args.designation ?? null,
      joiningDate: args.joiningDate ?? null,
      // status omitted → AstEmployee.status @default(Active)
    },
  });
  return toEmployeeFields(created);
}
