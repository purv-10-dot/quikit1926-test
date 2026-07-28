/**
 * Does a survey's audience filter include this employee?
 * Empty / absent audience = everyone. Shared by the "my surveys" list, the
 * respond endpoint, and the single-survey GET so the rule lives in one place.
 */
export function audienceMatches(
  audience: unknown,
  emp: { departmentId: string | null; employmentType: string },
): boolean {
  if (!audience || typeof audience !== "object") return true;
  const a = audience as { departments?: string[]; employmentTypes?: string[] };
  if (a.departments && a.departments.length > 0) {
    if (!emp.departmentId || !a.departments.includes(emp.departmentId)) return false;
  }
  if (a.employmentTypes && a.employmentTypes.length > 0) {
    if (!a.employmentTypes.includes(emp.employmentType)) return false;
  }
  return true;
}
