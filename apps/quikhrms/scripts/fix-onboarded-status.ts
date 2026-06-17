import { PrismaClient } from "@quikit/database";
import "dotenv/config";

const prisma = new PrismaClient();

async function main() {
  const stuck = await prisma.onboardingInstance.findMany({
    where: { status: "OnboardCompleted", deletedAt: null },
    select: { employeeId: true, orgId: true },
  });

  let fixed = 0;
  for (const row of stuck) {
    const emp = await prisma.employee.findFirst({
      where: { id: row.employeeId, orgId: row.orgId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!emp || emp.status === "Active") continue;
    await prisma.employee.update({
      where: { id: emp.id },
      data: { status: "Active", inviteStatus: "Invited" },
    });
    fixed++;
  }
  console.log(`Activated ${fixed} employees with completed onboarding`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
