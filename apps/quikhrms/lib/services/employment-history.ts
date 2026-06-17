import { prisma } from "@/lib/prisma";

/**
 * Auto-records EmploymentHistory entries whenever an employee's tracked fields
 * change anywhere in the HRMS (profile edit, etc.). Keeps the Employment
 * History timeline in sync without manual "Add Change" entries.
 */

type ChangeType =
  | "Promotion" | "Transfer" | "RoleChange" | "SalaryChange"
  | "ConfirmationChange" | "EmpStatusChange" | "DepartmentChange" | "ManagerChange";

export interface EmpFields {
  designationId?: string | null;
  departmentId?: string | null;
  reportingManagerId?: string | null;
  gradeId?: string | null;
  officeLocationId?: string | null;
  employmentType?: string | null;
  status?: string | null;
  jobTitle?: string | null;
}

type Resolver = "designation" | "department" | "employee" | "grade" | "location";

const TRACKED: { key: keyof EmpFields; label: string; changeType: ChangeType; resolver?: Resolver }[] = [
  { key: "designationId",      label: "Designation",       changeType: "RoleChange",       resolver: "designation" },
  { key: "departmentId",       label: "Department",        changeType: "DepartmentChange", resolver: "department" },
  { key: "reportingManagerId", label: "Reporting Manager", changeType: "ManagerChange",    resolver: "employee" },
  { key: "gradeId",            label: "Grade",             changeType: "Promotion",        resolver: "grade" },
  { key: "officeLocationId",   label: "Location",          changeType: "Transfer",         resolver: "location" },
  { key: "employmentType",     label: "Employment Type",   changeType: "RoleChange" },
  { key: "status",             label: "Status",            changeType: "EmpStatusChange" },
  { key: "jobTitle",           label: "Job Title",         changeType: "RoleChange" },
];

async function labelFor(resolver: Resolver | undefined, id: string | null): Promise<string> {
  if (!id) return "";
  if (!resolver) return String(id);
  switch (resolver) {
    case "designation": return (await prisma.designation.findUnique({ where: { id }, select: { title: true } }))?.title ?? id;
    case "department":  return (await prisma.department.findUnique({ where: { id }, select: { name: true } }))?.name ?? id;
    case "grade":       return (await prisma.grade.findUnique({ where: { id }, select: { name: true } }))?.name ?? id;
    case "location":    return (await prisma.officeLocation.findUnique({ where: { id }, select: { name: true } }))?.name ?? id;
    case "employee": {
      const e = await prisma.employee.findUnique({ where: { id }, select: { firstName: true, lastName: true } });
      return e ? `${e.firstName} ${e.lastName}`.trim() : id;
    }
  }
}

/**
 * Compare `before` vs `after` and create a history row per changed tracked field.
 * `after` only needs to contain the fields that were part of the update —
 * fields not present are skipped. Never throws (best-effort, fire-and-forget).
 * Returns the number of history rows created.
 */
export async function syncEmploymentHistory(
  orgId: string,
  employeeId: string,
  before: EmpFields,
  after: Record<string, unknown>,
  userId: string | null,
  effectiveDate: Date = new Date(),
): Promise<number> {
  let created = 0;
  for (const t of TRACKED) {
    if (!(t.key in after)) continue; // field wasn't part of this update
    const oldV = (before[t.key] ?? null) as string | null;
    const newV = ((after[t.key] as string | null | undefined) ?? null);
    if (oldV === newV) continue; // unchanged
    try {
      const fromLabel = t.resolver ? await labelFor(t.resolver, oldV) : (oldV ?? "");
      const toLabel = t.resolver ? await labelFor(t.resolver, newV) : (newV ?? "");
      await prisma.employmentHistory.create({
        data: {
          orgId,
          employeeId,
          changeType: t.changeType,
          fromValue: fromLabel ? { [t.label]: fromLabel } : undefined,
          toValue: { [t.label]: toLabel || "—" },
          effectiveDate,
          reason: "Auto-recorded from profile update",
          createdBy: userId ?? undefined,
        },
      });
      created++;
    } catch (e) {
      console.warn(`[employment-history] sync ${String(t.key)} failed: ${(e as Error).message}`);
    }
  }
  return created;
}
