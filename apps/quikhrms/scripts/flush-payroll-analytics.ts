import { PrismaClient } from "@quikit/database";
import "dotenv/config";

const prisma = new PrismaClient();

/**
 * Flush payroll analytics data — wipes pay runs, payslips, approvals, and
 * salary revisions. Preserves setup (SalaryStructure, EmployeeSalary, configs).
 *
 * Usage:
 *   npx tsx prisma/flush-payroll-analytics.ts                  # all tenants
 *   npx tsx prisma/flush-payroll-analytics.ts <orgId>       # one tenant
 */
async function main() {
  const tenantArg = process.argv[2];
  const where = tenantArg ? { orgId: tenantArg } : {};

  const [runs, payslips, approvals, revisions] = await Promise.all([
    prisma.payRun.count({ where }),
    prisma.payslip.count({ where }),
    prisma.payRunApproval.count({ where }),
    prisma.salaryRevision.count({ where }),
  ]);

  console.log(`Scope: ${tenantArg ? `tenant ${tenantArg}` : "ALL TENANTS"}`);
  console.log(`Will delete:`);
  console.log(`  PayRun:          ${runs}`);
  console.log(`  Payslip:         ${payslips}  (cascades PayslipLine)`);
  console.log(`  PayRunApproval:  ${approvals}`);
  console.log(`  SalaryRevision:  ${revisions}`);

  if (runs + payslips + approvals + revisions === 0) {
    console.log("\nNothing to delete.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.payRunApproval.deleteMany({ where });
    await tx.payslip.deleteMany({ where });
    await tx.payRun.deleteMany({ where });
    await tx.salaryRevision.deleteMany({ where });
  });

  console.log("\nFlushed.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
