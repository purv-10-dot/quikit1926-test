import { config } from "dotenv";
config();

import { PrismaClient } from "@quikit/database";

const prisma = new PrismaClient();

const TENANT = "tenant_dev_001";

async function main() {
  const pipeline = await prisma.hiringPipeline.findFirst({
    where: { orgId: TENANT, deletedAt: null, isDefault: true },
  });
  const stages: string[] = Array.isArray(pipeline?.stages)
    ? (pipeline!.stages as unknown[]).map((s) => (typeof s === "string" ? s : (s as { name: string }).name))
    : [];
  if (stages.length === 0) {
    console.log("No default pipeline found.");
    return;
  }

  // For each application, if it has a scheduled interview whose round maps to a later stage,
  // advance currentStage to that stage.
  const apps = await prisma.jobApplication.findMany({
    where: { orgId: TENANT, deletedAt: null },
    include: {
      interviews: {
        where: { deletedAt: null },
        orderBy: { round: "desc" },
        take: 1,
      },
      candidate: { select: { firstName: true, lastName: true } },
    },
  });

  let updated = 0;
  for (const app of apps) {
    const latest = app.interviews[0];
    if (!latest) continue;
    const targetStage = stages[latest.round - 1];
    if (!targetStage) continue;

    const currentIdx = app.currentStage ? stages.indexOf(app.currentStage) : -1;
    const targetIdx = stages.indexOf(targetStage);

    if (targetIdx > currentIdx) {
      await prisma.jobApplication.update({
        where: { id: app.id },
        data: { currentStage: targetStage },
      });
      console.log(`  ${app.candidate.firstName} ${app.candidate.lastName} → ${targetStage} (was ${app.currentStage ?? "null"})`);
      updated++;
    }
  }

  console.log(`Synced ${updated} applications.`);
}

main().finally(() => prisma.$disconnect());
