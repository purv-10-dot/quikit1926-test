import { prisma } from "@/lib/prisma";

export async function generateRequisitionNumber(orgId: string): Promise<string> {
  const last = await prisma.jobRequisition.findFirst({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    select: { requisitionNumber: true },
  });

  let next = 1;
  if (last?.requisitionNumber) {
    const match = last.requisitionNumber.match(/(\d+)$/);
    if (match) next = parseInt(match[1], 10) + 1;
  }

  return `QK-REQ-${String(next).padStart(4, "0")}`;
}
