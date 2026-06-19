/**
 * Diagnose + reset the super-admin login.
 * Login matches WORK email. This finds the account by work email, resets the
 * password, makes it Active, and clears any lockout. If no work-email match,
 * it lists accounts that mention the address (often it's the *personal* email).
 *
 * Run (against whatever DATABASE_URL .env points to — should be Neon):
 *   npx dotenv -e .env.local -- tsx prisma/reset-admin.ts
 */
import { PrismaClient } from "@quikit/database";
import pg from "pg";
import "dotenv/config";
import bcrypt from "bcryptjs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient();

const EMAIL = "gourav1231997@gmail.com";
const PASSWORD = "SuperAdmin@2026";

async function main() {
  console.log("DB:", (process.env.DATABASE_URL ?? "").split("@")[1]?.split("/")[0] ?? "(unknown)");

  const emp = await prisma.employee.findFirst({
    where: { workEmail: { equals: EMAIL, mode: "insensitive" }, deletedAt: null },
    select: { id: true, employeeCode: true, status: true, orgId: true, passwordHash: true, lockedUntil: true },
  });

  if (!emp) {
    console.log(`\n❌ No employee has WORK email = ${EMAIL}`);
    const near = await prisma.employee.findMany({
      where: {
        deletedAt: null,
        OR: [
          { workEmail: { contains: "gourav1231997", mode: "insensitive" } },
          { personalEmail: { contains: "gourav1231997", mode: "insensitive" } },
        ],
      },
      select: { employeeCode: true, workEmail: true, personalEmail: true, status: true },
    });
    console.log("Accounts mentioning that address:");
    for (const e of near) console.log(`  ${e.employeeCode}  work=${e.workEmail}  personal=${e.personalEmail}  status=${e.status}`);
    console.log("\n→ Log in with the WORK email shown above. (Tell me which and I can switch login to that, or change the work email.)");
    return;
  }

  console.log(`\nFound ${emp.employeeCode}  status=${emp.status}  tenant=${emp.orgId}  hadPassword=${!!emp.passwordHash}  lockedUntil=${emp.lockedUntil ?? "none"}`);

  await prisma.employee.update({
    where: { id: emp.id },
    data: {
      passwordHash: await bcrypt.hash(PASSWORD, 10),
      status: "Active",
      mustChangePassword: false,
      tempPasswordExpiresAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });
  console.log(`\n✅ Reset. Log in with:\n   email:    ${EMAIL}\n   password: ${PASSWORD}`);
  console.log("   (Super-admin login still sends a 2FA code to that inbox.)");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
