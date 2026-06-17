import { prisma } from "@/lib/prisma";

/** Generates next employee code like QK-EMP-0001 */
export async function generateEmployeeCode(orgId: string): Promise<string> {
  const lastEmployee = await prisma.employee.findFirst({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    select: { employeeCode: true },
  });

  let nextNumber = 1;
  if (lastEmployee?.employeeCode) {
    const match = lastEmployee.employeeCode.match(/(\d+)$/);
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1;
    }
  }

  return `QK-EMP-${String(nextNumber).padStart(4, "0")}`;
}
