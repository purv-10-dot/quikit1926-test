/**
 * Import merged.xlsx → Prisma. Idempotent upsert by (orgId, employeeCode).
 *
 * Usage:
 *   npx tsx prisma/import-onboarding.ts <orgId> [path/to/merged.xlsx]
 *
 * Default xlsx path: data/onboarding/merged.xlsx
 *
 * What it does:
 *   1. Auto-create Department / Designation / OfficeLocation by name (per tenant)
 *   2. Upsert Employee scalar fields + identity dummy IDs
 *   3. Set bankAccounts / educations / certifications / emergencyContacts / pastExperiences JSON
 *   4. Create EmployeeSalary (CTC = monthlyGross * 12) — single active row per employee
 *   5. Create EmployeeLoan rows (status Active when balance > 0, else Closed)
 */
import { PrismaClient } from "@quikit/database";
import "dotenv/config";
import * as XLSX from "xlsx";
import { resolve } from "path";

const prisma = new PrismaClient();

type Row = Record<string, any>;

function loadSheet(wb: XLSX.WorkBook, name: string): Row[] {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Row>(ws, { defval: "", raw: false });
}

const isoToDate = (v: any): Date | null => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

const code = (s: string) =>
  s.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "MISC";

async function ensureDepartment(orgId: string, name: string) {
  if (!name) return null;
  const c = code(name);
  const existing = await prisma.department.findFirst({
    where: { orgId, OR: [{ code: c }, { name }], deletedAt: null },
  });
  if (existing) return existing;
  return prisma.department.create({
    data: { orgId, name, code: c },
  });
}

async function ensureDesignation(orgId: string, title: string, departmentId: string | null) {
  if (!title) return null;
  const existing = await prisma.designation.findFirst({
    where: { orgId, title, deletedAt: null },
  });
  if (existing) return existing;
  return prisma.designation.create({
    data: { orgId, title, departmentId: departmentId ?? undefined },
  });
}

async function ensureOfficeLocation(orgId: string, name: string) {
  if (!name) return null;
  const existing = await prisma.officeLocation.findFirst({
    where: { orgId, name, deletedAt: null },
  });
  if (existing) return existing;
  return prisma.officeLocation.create({ data: { orgId, name } });
}

async function main() {
  const orgId = process.argv[2];
  const xlsxPath = process.argv[3] ?? resolve(__dirname, "../data/onboarding/merged.xlsx");

  if (!orgId) {
    console.error("Usage: npx tsx prisma/import-onboarding.ts <orgId> [merged.xlsx]");
    process.exit(1);
  }

  const wb = XLSX.readFile(xlsxPath);
  const employees = loadSheet(wb, "Employees");
  const banks = loadSheet(wb, "BankAccounts");
  const educs = loadSheet(wb, "Educations");
  const certs = loadSheet(wb, "Certifications");
  const emrcs = loadSheet(wb, "EmergencyContacts");
  const exps = loadSheet(wb, "PastExperiences");
  const sals = loadSheet(wb, "SalaryStructure");
  const loans = loadSheet(wb, "Loans");

  console.log(`Tenant: ${orgId}`);
  console.log(`Employees: ${employees.length} | Banks: ${banks.length} | Edu: ${educs.length} | Certs: ${certs.length} | Loans: ${loans.length}`);

  const groupBy = <T extends Row>(rows: T[], key = "employeeCode") => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const k = String(r[key] ?? "").trim();
      if (!k) continue;
      (m.get(k) ?? m.set(k, []).get(k)!).push(r);
    }
    return m;
  };
  const banksBy = groupBy(banks);
  const educsBy = groupBy(educs);
  const certsBy = groupBy(certs);
  const emrcsBy = groupBy(emrcs);
  const expsBy = groupBy(exps);
  const salsBy = groupBy(sals);
  const loansBy = groupBy(loans);

  let created = 0, updated = 0, salaryRows = 0, loanRows = 0;

  for (const e of employees) {
    const empCode = String(e.employeeCode);
    const dept = await ensureDepartment(orgId, String(e.department ?? ""));
    const desg = await ensureDesignation(orgId, String(e.designation ?? ""), dept?.id ?? null);
    const office = await ensureOfficeLocation(orgId, String(e.officeLocation ?? ""));

    const data = {
      orgId,
      employeeCode: empCode,
      firstName: String(e.firstName),
      middleName: e.middleName || null,
      lastName: String(e.lastName),
      displayName: e.displayName || null,
      gender: e.gender || null,
      dateOfBirth: isoToDate(e.dateOfBirth),
      bloodGroup: e.bloodGroup || null,
      maritalStatus: e.maritalStatus || null,
      nationality: e.nationality || "Indian",
      personalEmail: e.personalEmail || null,
      workEmail: String(e.workEmail),
      personalPhone: e.personalPhone || null,
      workPhone: e.workPhone || null,
      linkedinUrl: e.linkedinUrl || null,
      jobTitle: e.jobTitle || null,
      departmentId: dept?.id ?? null,
      designationId: desg?.id ?? null,
      officeLocationId: office?.id ?? null,
      employmentType: e.employmentType || "FullTime",
      workerType: e.workerType || "Permanent",
      workLocation: e.workLocation || "Office",
      sourceOfHire: e.sourceOfHire || null,
      noticePeriodDays: parseInt(String(e.noticePeriodDays)) || 30,
      dateOfJoining: isoToDate(e.dateOfJoining) ?? new Date(),
      confirmationDate: isoToDate(e.confirmationDate),
      probationEndDate: isoToDate(e.probationEndDate),
      lastWorkingDate: isoToDate(e.lastWorkingDate),
      previousExperience: parseInt(String(e.previousExperience)) || 0,
      panNumber: e.panNumber || null,
      aadhaarNumber: e.aadhaarNumber || null,
      uanNumber: e.uanNumber || null,
      pfAccountNumber: e.pfAccountNumber || null,
      esiNumber: e.esiNumber || null,
      skillSet: e.skills || null,
      status: "Active" as const,
      inviteStatus: "NotInvited" as const,
      taxResidencyStatus: "Resident" as const,
      taxCountry: "IN",
      deletedAt: null,
      bankAccounts: (banksBy.get(empCode) ?? []).map((b) => ({
        bankName: b.bankName,
        branchName: b.branchName,
        accountNumber: b.accountNumber,
        accountHolder: b.accountHolderName,
        ifscCode: b.ifscCode,
        accountType: b.accountType || "Savings",
        isPrimary: true,
      })),
      educations: (educsBy.get(empCode) ?? []).map((x) => ({
        level: x.level,
        institution: x.institution,
        degree: x.degree,
        year: x.year,
        grade: x.grade,
      })),
      certifications: (certsBy.get(empCode) ?? []).map((x) => ({
        courseName: x.courseName,
        issuingAuthority: x.issuingAuthority,
        year: x.year,
      })),
      emergencyContacts: (emrcsBy.get(empCode) ?? []).map((x) => ({
        name: x.name,
        relationship: x.relationship,
        phone: x.phone,
        alternatePhone: x.alternatePhone || null,
        address: x.address || null,
      })),
      pastExperiences: (expsBy.get(empCode) ?? []).map((x) => ({
        company: x.company,
        jobTitle: x.jobTitle,
        totalExperience: x.totalExperience,
        lastWorkingDate: x.lastWorkingDate || null,
      })),
    };

    const existing = await prisma.employee.findFirst({
      where: { orgId, employeeCode: empCode },
      select: { id: true },
    });

    let employeeId: string;
    if (existing) {
      await prisma.employee.update({ where: { id: existing.id }, data });
      employeeId = existing.id;
      updated++;
    } else {
      const e2 = await prisma.employee.create({ data });
      employeeId = e2.id;
      created++;
    }

    // Salary
    const sal = salsBy.get(empCode)?.[0];
    if (sal) {
      const ctc = parseFloat(String(sal.annualCtc).replace(/,/g, "")) || 0;
      if (ctc > 0) {
        // Deactivate prior active rows
        await prisma.employeeSalary.updateMany({
          where: { orgId, employeeId, isActive: true, deletedAt: null },
          data: { isActive: false, effectiveTo: new Date() },
        });
        await prisma.employeeSalary.create({
          data: {
            orgId,
            employeeId,
            ctc,
            currency: "INR",
            effectiveFrom: isoToDate(sal.effectiveFrom) ?? new Date(),
            isActive: true,
            overrides: {
              monthlyGross: parseFloat(String(sal.monthlyGross)) || 0,
              basic: parseFloat(String(sal.basic)) || 0,
              hra: parseFloat(String(sal.hra)) || 0,
              specialAllowance: parseFloat(String(sal.specialAllowance)) || 0,
              professionalTax: parseFloat(String(sal.professionalTax)) || 0,
              remark: sal.remark || null,
            },
          },
        });
        salaryRows++;
      }
    }

    // Loans (avoid duplicate by deleting prior open loans for this employee)
    const loanList = loansBy.get(empCode) ?? [];
    if (loanList.length > 0) {
      await prisma.employeeLoan.deleteMany({
        where: { orgId, employeeId, status: { in: ["Disbursed", "Approved", "Pending"] } },
      });
      for (const l of loanList) {
        const principal = parseFloat(String(l.principalAmount).replace(/,/g, "")) || 0;
        const balance = parseFloat(String(l.outstandingBalance).replace(/,/g, "")) || 0;
        const emi = parseFloat(String(l.monthlyDeduction).replace(/,/g, "")) || 0;
        const tenure = emi > 0 ? Math.ceil(principal / emi) : 12;
        await prisma.employeeLoan.create({
          data: {
            orgId,
            employeeId,
            loanType: "Personal",
            principalAmount: principal,
            interestRate: 0,
            tenureMonths: tenure,
            emiAmount: emi || principal / 12,
            outstandingAmount: balance,
            status: l.status === "Closed" ? "Closed" : "Disbursed",
            startDate: new Date(),
          },
        });
        loanRows++;
      }
    }

    console.log(`  ${empCode} ${existing ? "↻" : "✚"} ${e.displayName}`);
  }

  console.log(`\nCreated: ${created} | Updated: ${updated} | Salary: ${salaryRows} | Loans: ${loanRows}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
