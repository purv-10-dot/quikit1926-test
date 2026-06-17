import { prisma } from "@/lib/prisma";

export async function generateTicketNumber(orgId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `TKT-${year}-`;

  const last = await prisma.ticket.findFirst({
    where: { orgId, ticketNo: { startsWith: prefix } },
    orderBy: { createdAt: "desc" },
    select: { ticketNo: true },
  });

  let next = 1;
  if (last?.ticketNo) {
    const match = last.ticketNo.match(/(\d+)$/);
    if (match) next = parseInt(match[1], 10) + 1;
  }

  return `${prefix}${String(next).padStart(4, "0")}`;
}
