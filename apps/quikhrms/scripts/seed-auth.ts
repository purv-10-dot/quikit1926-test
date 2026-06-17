// Provision a login password for an admin employee + ensure super_admin role.
//
// Run:
//   npx dotenv-cli -e .env.local -- tsx prisma/seed-auth.ts <email> <password> [orgId]
//
// If <email> matches an existing employee's workEmail, that employee gets the
// password. Otherwise it falls back to QK-EMP-0001 / first active employee.

import { PrismaClient } from "@quikit/database";
import pg from "pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient();
const APP_ID = "quikhrms";

(async () => {
  const email = process.argv[2];
  const password = process.argv[3];
  const orgId = process.argv[4] ?? "tenant_dev_001";

  if (!email || !password) {
    console.error("Usage: tsx prisma/seed-auth.ts <email> <password> [orgId]");
    process.exit(1);
  }

  // Locate the target employee.
  let emp = await prisma.employee.findFirst({
    where: { orgId, deletedAt: null, workEmail: { equals: email, mode: "insensitive" } },
    select: { id: true, employeeCode: true, workEmail: true, firstName: true, lastName: true },
  });
  if (!emp) {
    emp = await prisma.employee.findFirst({
      where: { orgId, employeeCode: "QK-EMP-0001", deletedAt: null },
      select: { id: true, employeeCode: true, workEmail: true, firstName: true, lastName: true },
    });
  }
  if (!emp) {
    emp = await prisma.employee.findFirst({
      where: { orgId, deletedAt: null, status: "Active" },
      orderBy: { createdAt: "asc" },
      select: { id: true, employeeCode: true, workEmail: true, firstName: true, lastName: true },
    });
  }
  if (!emp) {
    console.error(`No employee found in tenant=${orgId}. Run the main seed first.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.employee.update({ where: { id: emp.id }, data: { passwordHash } });
  console.log(`✓ Password set for ${emp.employeeCode} (${emp.workEmail})`);

  // Ensure super_admin link.
  const role = await prisma.hrmsAppRole.findFirst({
    where: { orgId: orgId, appId: APP_ID, name: "super_admin" },
    select: { id: true },
  });
  if (role) {
    await prisma.hrmsUserAppRole.upsert({
      where: { userId_orgId_roleId: { userId: emp.id, orgId: orgId, roleId: role.id } },
      create: { userId: emp.id, orgId: orgId, roleId: role.id, assignedBy: "seed-auth" },
      update: {},
    });
    console.log("✓ Linked to super_admin");
  } else {
    console.warn("! super_admin AppRole not found — run RBAC seed (seed-rbac-v2.ts) to grant access.");
  }

  console.log(`\nLogin with:\n  email:    ${emp.workEmail}\n  password: <the one you passed>`);

  await prisma.$disconnect();
  await pool.end();
})();
