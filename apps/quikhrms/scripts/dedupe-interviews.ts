import { config } from "dotenv";
config();

import { PrismaClient } from "@quikit/database";

const prisma = new PrismaClient();

async function main() {
  const orgId = "tenant_dev_001";

  const all = await prisma.interview.findMany({
    where: { orgId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });

  // Group by applicationId + round + scheduledAt + interviewerId
  const seen = new Map<string, string>();
  const dupeIds: string[] = [];
  for (const i of all) {
    const key = [
      i.applicationId,
      i.round,
      i.scheduledAt.toISOString(),
      i.interviewerId,
    ].join("|");
    if (seen.has(key)) {
      dupeIds.push(i.id);
    } else {
      seen.set(key, i.id);
    }
  }

  if (dupeIds.length === 0) {
    console.log("No duplicate interviews found.");
    return;
  }

  // Scorecard data lives on the interview row now (no separate table), so it's
  // soft-deleted along with the duplicate interview below.

  // Soft-delete duplicates
  const res = await prisma.interview.updateMany({
    where: { id: { in: dupeIds } },
    data: { deletedAt: new Date() },
  });

  console.log(`Soft-deleted ${res.count} duplicate interviews. Kept ${seen.size} unique rows.`);
}

main().finally(() => prisma.$disconnect());
