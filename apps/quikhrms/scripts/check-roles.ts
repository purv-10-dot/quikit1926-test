/**
 * Diagnostic: print every employee's actual role assignments and any per-user
 * permission extras. Read-only — changes nothing.
 *
 * Run:  npx dotenv -e .env.local -- tsx prisma/check-roles.ts
 */
import { PrismaClient } from "@quikit/database";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient();

async function main() {
  const employees = await prisma.employee.findMany({
    where: { deletedAt: null },
    select: { id: true, orgId: true, employeeCode: true, firstName: true, lastName: true, workEmail: true },
    orderBy: { employeeCode: "asc" },
  });

  for (const e of employees) {
    const roles = await prisma.hrmsUserAppRole.findMany({
      where: { userId: e.id, orgId: e.orgId },
      select: { role: { select: { name: true } } },
    });
    const extras = await prisma.hrmsUserPermissionExtra.findMany({
      where: { userId: e.id, orgId: e.orgId },
      select: { resource: true, action: true, kind: true },
    });

    const roleNames = roles.map((r) => r.role.name).join(", ") || "(none)";
    const extraStr = extras.length
      ? extras.map((x) => `${x.kind}:${x.resource}.${x.action}`).join(", ")
      : "(none)";

    const flag = roles.length > 1 || extras.length > 0 ? "  ⚠️" : "";
    console.log(`${e.employeeCode}  ${e.firstName} ${e.lastName} <${e.workEmail}>`);
    console.log(`   roles : ${roleNames}`);
    console.log(`   extras: ${extraStr}${flag}`);
  }
  console.log(`\nTotal employees: ${employees.length}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
