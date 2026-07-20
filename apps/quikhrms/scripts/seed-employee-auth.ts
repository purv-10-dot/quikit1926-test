// Set a login password for a plain EMPLOYEE (no super_admin grant).
// Run:  npx tsx scripts/seed-employee-auth.ts <email> <password> [orgId]
import { PrismaClient } from "@quikit/database";
import bcrypt from "bcryptjs";
import "dotenv/config";

const prisma = new PrismaClient();

(async () => {
  const email = process.argv[2];
  const password = process.argv[3];
  const orgId = process.argv[4] ?? "tenant_dev_001";
  if (!email || !password) {
    console.error("Usage: tsx scripts/seed-employee-auth.ts <email> <password> [orgId]");
    process.exit(1);
  }

  const emp = await prisma.employee.findFirst({
    where: { orgId, deletedAt: null, workEmail: { equals: email, mode: "insensitive" } },
    select: { id: true, employeeCode: true, workEmail: true, firstName: true, lastName: true },
  });
  if (!emp) {
    console.error(`No employee with workEmail=${email} in tenant=${orgId}.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.employee.update({ where: { id: emp.id }, data: { passwordHash } });
  console.log(`✓ Password set for ${emp.employeeCode} (${emp.workEmail})`);

  const roles = await prisma.hrmsUserAppRole.findMany({
    where: { userId: emp.id, orgId },
    select: { role: { select: { name: true } } },
  });
  console.log(`  roles: ${roles.map((r) => r.role?.name).join(", ") || "(none)"}`);
  console.log(`\nLogin at /login with:\n  email:    ${emp.workEmail}\n  password: ${password}`);

  await prisma.$disconnect();
})();
