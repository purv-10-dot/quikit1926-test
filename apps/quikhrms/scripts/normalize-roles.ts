/**
 * Normalize role assignments so every employee has EXACTLY ONE role.
 *   - No role        → assign `employee`.
 *   - Multiple roles → keep `employee` if present (least privilege),
 *                      otherwise keep the highest-priority single role;
 *                      remove the rest.
 *
 * Re-promote specific people afterward from Settings → Users.
 *
 * Run:  npx dotenv -e .env.local -- tsx prisma/normalize-roles.ts
 */
import { PrismaClient } from "@quikit/database";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient();

const APP_ID = "quikhrms";
// Lower number = lower privilege. When a user has several roles we keep the
// LOWEST-privilege one (safest), so accidental elevation is removed.
const PRIVILEGE: Record<string, number> = {
  employee: 1, recruiter: 2, manager: 3, hr_manager: 4,
  finance_admin: 5, it_admin: 5, hr_admin: 6, super_admin: 9,
};

async function main() {
  const employees = await prisma.employee.findMany({
    where: { deletedAt: null },
    select: { id: true, orgId: true, employeeCode: true, firstName: true, lastName: true },
    orderBy: { employeeCode: "asc" },
  });

  let changed = 0;
  for (const e of employees) {
    const assigns = await prisma.hrmsUserAppRole.findMany({
      where: { userId: e.id, orgId: e.orgId },
      select: { id: true, roleId: true, role: { select: { name: true } } },
    });

    // Case 1: no role → assign the tenant's employee role.
    if (assigns.length === 0) {
      const empRole = await prisma.hrmsAppRole.findFirst({
        where: { orgId: e.orgId, appId: APP_ID, name: "employee" },
        select: { id: true },
      });
      if (empRole) {
        await prisma.hrmsUserAppRole.create({
          data: { userId: e.id, orgId: e.orgId, roleId: empRole.id, assignedBy: "system" },
        });
        console.log(`${e.employeeCode} ${e.firstName} ${e.lastName}: (none) → employee`);
        changed++;
      }
      continue;
    }

    // Case 2: single role → already fine.
    if (assigns.length === 1) continue;

    // Case 3: multiple roles → keep the least-privilege one, drop the rest.
    const sorted = [...assigns].sort(
      (a, b) => (PRIVILEGE[a.role.name] ?? 99) - (PRIVILEGE[b.role.name] ?? 99),
    );
    const keep = sorted[0];
    const drop = sorted.slice(1);
    await prisma.hrmsUserAppRole.deleteMany({ where: { id: { in: drop.map((d) => d.id) } } });
    console.log(
      `${e.employeeCode} ${e.firstName} ${e.lastName}: [${assigns.map((a) => a.role.name).join(", ")}] → kept ${keep.role.name}`,
    );
    changed++;
  }

  console.log(`\n✅ Normalized ${changed} employee(s). Each user now has exactly one role.`);
  console.log("   Affected users should log out/in (permissions cached ~5 min).");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
