// One-shot: link the QK-EMP-0001 employee (or first active employee) to the
// super_admin AppRole in the default tenant.
//
// Run:  npx dotenv-cli -e .env.local -- tsx prisma/link-me-to-super-admin.ts [orgId]

import { PrismaClient } from "@quikit/database";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient();
const APP_ID = "quikhrms";

(async () => {
  const orgId = process.argv[2] ?? "tenant_dev_001";
  console.log(`Linking to super_admin in tenant=${orgId}`);

  const role = await prisma.hrmsAppRole.findFirst({
    where: { orgId: orgId, appId: APP_ID, name: "super_admin" },
    select: { id: true },
  });
  if (!role) {
    console.error("super_admin AppRole not found. Run seed first.");
    process.exit(1);
  }

  // Find QK-EMP-0001 first; fallback to first active employee in tenant.
  let emp = await prisma.employee.findFirst({
    where: { orgId, employeeCode: "QK-EMP-0001", deletedAt: null },
    select: { id: true, employeeCode: true, firstName: true, lastName: true },
  });
  if (!emp) {
    emp = await prisma.employee.findFirst({
      where: { orgId, deletedAt: null, status: "Active" },
      orderBy: { createdAt: "asc" },
      select: { id: true, employeeCode: true, firstName: true, lastName: true },
    });
  }
  if (!emp) {
    console.error("No employees found in tenant. Run seed first.");
    process.exit(1);
  }

  await prisma.hrmsUserAppRole.upsert({
    where: {
      userId_orgId_roleId: { userId: emp.id, orgId: orgId, roleId: role.id },
    },
    create: { userId: emp.id, orgId: orgId, roleId: role.id, assignedBy: "manual-link" },
    update: {},
  });

  console.log(`✓ ${emp.employeeCode} (${emp.firstName} ${emp.lastName}, id=${emp.id}) → super_admin`);
  console.log(`\nUse this id as x-user-id header (or set localStorage 'hrms.user-id' in dev panel).`);

  await prisma.$disconnect();
  await pool.end();
})();
