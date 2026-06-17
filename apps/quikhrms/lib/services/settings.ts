import { prisma } from "@/lib/prisma";

export async function getOrCreateCompanySettings(orgId: string, userId: string) {
  const existing = await prisma.companySettings.findUnique({ where: { orgId } });
  if (existing) return existing;

  return prisma.companySettings.create({
    data: {
      orgId,
      companyName: "My Company",
      workWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      createdBy: userId,
      updatedBy: userId,
    },
  });
}

export function yearFromDate(dateStr: string): number {
  return new Date(dateStr).getUTCFullYear();
}
