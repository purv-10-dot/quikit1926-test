import { PrismaClient } from "@quikit/database";
import "dotenv/config";

const prisma = new PrismaClient();

async function main() {
  const tenantArg = process.argv[2];

  const where = {
    status: "PreBoarding" as const,
    deletedAt: null,
    ...(tenantArg ? { orgId: tenantArg } : {}),
  };

  const targets = await prisma.employee.findMany({
    where,
    select: { id: true, employeeCode: true, firstName: true, lastName: true, orgId: true },
  });

  if (targets.length === 0) {
    console.log("No PreBoarding employees found.");
    return;
  }

  console.log(`Found ${targets.length} PreBoarding employees${tenantArg ? ` in tenant ${tenantArg}` : " (all tenants)"}:`);
  targets.forEach((e) => console.log(`  ${e.employeeCode} — ${e.firstName} ${e.lastName} (tenant ${e.orgId})`));

  const result = await prisma.employee.updateMany({
    where,
    data: { status: "Active" },
  });

  console.log(`\nActivated ${result.count} employees.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
