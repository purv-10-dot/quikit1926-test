import { config } from "dotenv";
config();

import { PrismaClient } from "@quikit/database";

const prisma = new PrismaClient();

const TENANT = "tenant_dev_001";
const USER = "user_dev_001";

async function main() {
  const year = new Date().getFullYear();

  const employee = await prisma.employee.findFirst({
    where: {
      orgId: TENANT,
      OR: [{ id: USER }, { employeeCode: "QK-EMP-0001" }],
      deletedAt: null,
    },
  });
  if (!employee) throw new Error("Admin employee not found");
  const employeeId = employee.id;

  const types = await prisma.leaveType.findMany({
    where: { orgId: TENANT, deletedAt: null },
  });
  if (types.length === 0) throw new Error("No leave types found — run seed first");

  for (const lt of types) {
    const opening = Number(lt.maxBalance) > 0 ? Number(lt.maxBalance) : 15;
    await prisma.leaveBalance.upsert({
      where: {
        orgId_employeeId_leaveTypeId_year: {
          orgId: TENANT, employeeId, leaveTypeId: lt.id, year,
        },
      },
      create: {
        orgId: TENANT, employeeId, leaveTypeId: lt.id, year,
        opening, accrued: 0, taken: 0,
        createdBy: USER, updatedBy: USER,
      },
      update: {
        opening, taken: 0, lapsed: 0, encashed: 0,
        updatedBy: USER,
      },
    });
    console.log(`  ${lt.code} → ${opening}`);
  }

  console.log(`Seeded ${types.length} balances for ${employeeId} (${year})`);
}

main().finally(() => prisma.$disconnect());
