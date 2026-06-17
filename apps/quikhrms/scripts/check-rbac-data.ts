import { PrismaClient } from "@quikit/database";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient();

(async () => {
  const roles = await prisma.hrmsAppRole.findMany({
    select: { id: true, name: true, isSystem: true, isDefault: true, orgId: true },
  });
  console.log(`AppRole rows: ${roles.length}`);
  roles.forEach((r) => console.log(`  ${r.name.padEnd(15)} system=${r.isSystem} default=${r.isDefault} org=${r.orgId}`));

  const links = await prisma.hrmsUserAppRole.findMany({
    include: {
      role: { select: { name: true } },
      employee: { select: { employeeCode: true, firstName: true, lastName: true } },
    },
  });
  console.log(`\nUserAppRole rows: ${links.length}`);
  links.forEach((l) => console.log(`  ${l.employee.employeeCode} (${l.employee.firstName} ${l.employee.lastName}) → ${l.role.name}`));

  const rpCount = await prisma.hrmsRolePermission.count();
  console.log(`\nRolePermission rows: ${rpCount}`);

  await prisma.$disconnect();
  await pool.end();
})();
