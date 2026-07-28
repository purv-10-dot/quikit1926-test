import { prisma } from "@/lib/prisma";

/** Generates next employee code like QK-EMP-0001 */
export async function generateEmployeeCode(orgId: string): Promise<string> {
  // Look at ALL codes in the org (incl. soft-deleted — the unique constraint is
  // (orgId, employeeCode) regardless of deletedAt). Base the next number on the
  // highest existing code, not the most-recently-created one, so out-of-order or
  // reused codes can't cause a duplicate. Then step forward until the code is
  // genuinely unused.
  const employees = await prisma.employee.findMany({
    where: { orgId },
    select: { employeeCode: true },
  });

  const taken = new Set(employees.map((e) => e.employeeCode).filter(Boolean));
  let maxNumber = 0;
  for (const code of taken) {
    const match = code!.match(/(\d+)$/);
    if (match) maxNumber = Math.max(maxNumber, parseInt(match[1], 10));
  }

  let next = maxNumber + 1;
  let candidate = `QK-EMP-${String(next).padStart(4, "0")}`;
  while (taken.has(candidate)) {
    next += 1;
    candidate = `QK-EMP-${String(next).padStart(4, "0")}`;
  }
  return candidate;
}
