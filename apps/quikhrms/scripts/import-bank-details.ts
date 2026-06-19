import { PrismaClient } from "@quikit/database";
import "dotenv/config";
import { readFileSync } from "fs";
import { resolve } from "path";

const prisma = new PrismaClient();

/**
 * Import bank details from CSV → updates Employee.bankAccounts JSON.
 *
 * Expected CSV header (case-insensitive, flexible):
 *   Emp ID, Employee Name, Bank Name, Branch Name, Account Number, Account Holder Name, IFSC Code, Account Type
 *
 * Usage:
 *   npx tsx prisma/import-bank-details.ts <path-to-bank.csv>           # all tenants matched
 *   npx tsx prisma/import-bank-details.ts <path-to-bank.csv> tenant_dev_001
 */
function parseCSV(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });
}

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const found = Object.keys(row).find((rk) => rk.trim().toLowerCase() === k.trim().toLowerCase());
    if (found && row[found]) return row[found].trim();
  }
  return "";
}

async function main() {
  const csvPath = process.argv[2];
  const tenantArg = process.argv[3];
  if (!csvPath) {
    console.error("Usage: npx tsx prisma/import-bank-details.ts <bank.csv> [orgId]");
    process.exit(1);
  }

  const fullPath = resolve(csvPath);
  const text = readFileSync(fullPath, "utf-8");
  const rows = parseCSV(text);
  console.log(`Parsed ${rows.length} rows from ${fullPath}`);

  let updated = 0;
  let skipped = 0;
  const notFound: string[] = [];

  for (const r of rows) {
    const empCode = pick(r, "Emp ID", "EmpID", "Employee Code", "Code");
    const bankName = pick(r, "Bank Name");
    const accountNumber = pick(r, "Account Number");
    const accountHolder = pick(r, "Account Holder Name");
    const ifscCode = pick(r, "IFSC Code", "IFSC");
    const accountType = pick(r, "Account Type") || "Savings";
    const branch = pick(r, "Branch Name");

    if (!empCode || !accountNumber) {
      skipped++;
      continue;
    }

    const employee = await prisma.employee.findFirst({
      where: {
        employeeCode: empCode,
        deletedAt: null,
        ...(tenantArg ? { orgId: tenantArg } : {}),
      },
      select: { id: true, orgId: true },
    });

    if (!employee) {
      notFound.push(empCode);
      continue;
    }

    const bankAccount = {
      bankName,
      accountNumber,
      accountHolder,
      ifscCode,
      accountType,
      branch,
      isPrimary: true,
    };

    await prisma.employee.update({
      where: { id: employee.id },
      data: { bankAccounts: [bankAccount] },
    });
    updated++;
    console.log(`  ${empCode} ← ${bankName} (${accountNumber})`);
  }

  console.log(`\nUpdated: ${updated}`);
  console.log(`Skipped (missing data): ${skipped}`);
  if (notFound.length > 0) console.log(`Not found: ${notFound.join(", ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
