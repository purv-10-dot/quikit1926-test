import { prisma } from "@/lib/prisma";
import type { ReportDefinition } from "../types";
import { fmtDate, fullName, dateRange } from "../format";

// Resolve reporting-manager names without guessing a relation name — fetch a map.
async function managerMap(orgId: string, ids: (string | null)[]) {
  const unique = [...new Set(ids.filter(Boolean) as string[])];
  if (!unique.length) return new Map<string, string>();
  const mgrs = await prisma.employee.findMany({
    where: { orgId, id: { in: unique } },
    select: { id: true, firstName: true, lastName: true, employeeCode: true },
  });
  return new Map(mgrs.map((m) => [m.id, `${fullName(m)} (${m.employeeCode})`]));
}

function primaryBank(bankAccounts: unknown): { acc: string; ifsc: string; bank: string } {
  const arr = Array.isArray(bankAccounts) ? bankAccounts : [];
  const b = (arr[0] ?? {}) as Record<string, unknown>;
  return {
    acc: String(b.accountNumber ?? b.accountNo ?? ""),
    ifsc: String(b.ifsc ?? b.ifscCode ?? ""),
    bank: String(b.bankName ?? b.bank ?? ""),
  };
}

const yearsBetween = (a: Date, b: Date) => Math.round(((b.getTime() - a.getTime()) / (365.25 * 86_400_000)) * 10) / 10;

export const orgReports: ReportDefinition[] = [
  {
    key: "employee-master",
    label: "Employee Master",
    description: "Complete employee directory with department, designation, manager and status.",
    category: "Organization",
    async run({ orgId }) {
      const emps = await prisma.employee.findMany({
        where: { orgId, deletedAt: null },
        include: { department: { select: { name: true } }, designation: { select: { title: true } } },
        orderBy: { employeeCode: "asc" },
      });
      const mgrs = await managerMap(orgId, emps.map((e) => e.reportingManagerId));
      return {
        title: "Employee Master",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "department", label: "Department", width: 18 },
          { key: "designation", label: "Designation", width: 20 },
          { key: "manager", label: "Reporting Manager", width: 22 },
          { key: "employmentType", label: "Employment Type", width: 16 },
          { key: "workerType", label: "Worker Type", width: 14 },
          { key: "status", label: "Status", width: 12 },
          { key: "location", label: "Work Location", width: 14 },
          { key: "doj", label: "Date of Joining", width: 14 },
          { key: "email", label: "Work Email", width: 26 },
        ],
        rows: emps.map((e) => ({
          code: e.employeeCode,
          name: fullName(e),
          department: e.department?.name ?? "",
          designation: e.designation?.title ?? "",
          manager: e.reportingManagerId ? mgrs.get(e.reportingManagerId) ?? "" : "",
          employmentType: e.employmentType,
          workerType: e.workerType,
          status: e.status,
          location: e.workLocation,
          doj: fmtDate(e.dateOfJoining),
          email: e.workEmail,
        })),
      };
    },
  },
  {
    key: "headcount-summary",
    label: "Headcount Summary",
    description: "Active vs total headcount grouped by department, with status breakdown.",
    category: "Organization",
    async run({ orgId }) {
      const emps = await prisma.employee.findMany({
        where: { orgId, deletedAt: null },
        select: { status: true, department: { select: { name: true } } },
      });
      const map = new Map<string, { total: number; active: number; onLeave: number; onNotice: number }>();
      for (const e of emps) {
        const k = e.department?.name ?? "(Unassigned)";
        const row = map.get(k) ?? { total: 0, active: 0, onLeave: 0, onNotice: 0 };
        row.total++;
        if (e.status === "Active") row.active++;
        if (e.status === "OnLeave") row.onLeave++;
        if (e.status === "OnNotice") row.onNotice++;
        map.set(k, row);
      }
      return {
        title: "Headcount Summary",
        columns: [
          { key: "department", label: "Department", width: 24 },
          { key: "total", label: "Total", width: 10 },
          { key: "active", label: "Active", width: 10 },
          { key: "onLeave", label: "On Leave", width: 10 },
          { key: "onNotice", label: "On Notice", width: 12 },
        ],
        rows: [...map.entries()]
          .sort((a, b) => b[1].total - a[1].total)
          .map(([department, v]) => ({ department, ...v })),
      };
    },
  },
  {
    key: "new-joiners",
    label: "New Joiners",
    description: "Employees who joined within the selected date range.",
    category: "Organization",
    usesDateRange: true,
    async run({ orgId, dateFrom, dateTo }) {
      const emps = await prisma.employee.findMany({
        where: { orgId, deletedAt: null, ...dateRange("dateOfJoining", dateFrom, dateTo) },
        include: { department: { select: { name: true } }, designation: { select: { title: true } } },
        orderBy: { dateOfJoining: "desc" },
      });
      return {
        title: "New Joiners Report",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "department", label: "Department", width: 18 },
          { key: "designation", label: "Designation", width: 20 },
          { key: "doj", label: "Date of Joining", width: 14 },
          { key: "employmentType", label: "Employment Type", width: 16 },
          { key: "source", label: "Source of Hire", width: 16 },
          { key: "location", label: "Location", width: 14 },
        ],
        rows: emps.map((e) => ({
          code: e.employeeCode,
          name: fullName(e),
          department: e.department?.name ?? "",
          designation: e.designation?.title ?? "",
          doj: fmtDate(e.dateOfJoining),
          employmentType: e.employmentType,
          source: e.sourceOfHire ?? "",
          location: e.workLocation,
        })),
      };
    },
  },
  {
    key: "attrition",
    label: "Attrition / Separation",
    description: "Employees relieved or with a last-working-date in the selected range, with tenure.",
    category: "Organization",
    usesDateRange: true,
    async run({ orgId, dateFrom, dateTo }) {
      const emps = await prisma.employee.findMany({
        where: {
          orgId, deletedAt: null,
          OR: [
            { lastWorkingDate: { not: null, ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } },
            ...(dateFrom || dateTo ? [] : [{ status: "Relieved" as const }]),
          ],
        },
        include: { department: { select: { name: true } }, designation: { select: { title: true } } },
        orderBy: { lastWorkingDate: "desc" },
      });
      return {
        title: "Attrition / Separation Report",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "department", label: "Department", width: 18 },
          { key: "designation", label: "Designation", width: 20 },
          { key: "doj", label: "Date of Joining", width: 14 },
          { key: "lwd", label: "Last Working Date", width: 16 },
          { key: "tenureYears", label: "Tenure (yrs)", width: 12 },
          { key: "status", label: "Status", width: 12 },
        ],
        rows: emps.map((e) => ({
          code: e.employeeCode,
          name: fullName(e),
          department: e.department?.name ?? "",
          designation: e.designation?.title ?? "",
          doj: fmtDate(e.dateOfJoining),
          lwd: fmtDate(e.lastWorkingDate),
          tenureYears: e.lastWorkingDate ? yearsBetween(e.dateOfJoining, e.lastWorkingDate) : "",
          status: e.status,
        })),
      };
    },
  },
  {
    key: "probation-confirmation-due",
    label: "Probation & Confirmation Due",
    description: "Employees with an upcoming or past probation-end date awaiting confirmation.",
    category: "Organization",
    async run({ orgId }) {
      const emps = await prisma.employee.findMany({
        where: { orgId, deletedAt: null, probationEndDate: { not: null }, confirmationDate: null },
        include: { department: { select: { name: true } }, designation: { select: { title: true } } },
        orderBy: { probationEndDate: "asc" },
      });
      return {
        title: "Probation & Confirmation Due",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "department", label: "Department", width: 18 },
          { key: "designation", label: "Designation", width: 20 },
          { key: "doj", label: "Date of Joining", width: 14 },
          { key: "probationEnd", label: "Probation End", width: 14 },
          { key: "workerType", label: "Worker Type", width: 14 },
          { key: "status", label: "Status", width: 12 },
        ],
        rows: emps.map((e) => ({
          code: e.employeeCode,
          name: fullName(e),
          department: e.department?.name ?? "",
          designation: e.designation?.title ?? "",
          doj: fmtDate(e.dateOfJoining),
          probationEnd: fmtDate(e.probationEndDate),
          workerType: e.workerType,
          status: e.status,
        })),
      };
    },
  },
  {
    key: "birthday-anniversary",
    label: "Birthday & Work Anniversary",
    description: "Birth dates and joining anniversaries with completed years of service.",
    category: "Organization",
    async run({ orgId }) {
      const emps = await prisma.employee.findMany({
        where: { orgId, deletedAt: null, status: { in: ["Active", "OnLeave", "OnNotice"] } },
        include: { department: { select: { name: true } } },
        orderBy: { firstName: "asc" },
      });
      const now = new Date();
      return {
        title: "Birthday & Work Anniversary",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "department", label: "Department", width: 18 },
          { key: "dob", label: "Date of Birth", width: 14 },
          { key: "birthMonth", label: "Birth Month", width: 12 },
          { key: "doj", label: "Date of Joining", width: 14 },
          { key: "yearsOfService", label: "Years of Service", width: 14 },
        ],
        rows: emps.map((e) => ({
          code: e.employeeCode,
          name: fullName(e),
          department: e.department?.name ?? "",
          dob: fmtDate(e.dateOfBirth),
          birthMonth: e.dateOfBirth ? e.dateOfBirth.toLocaleDateString("en-IN", { month: "long" }) : "",
          doj: fmtDate(e.dateOfJoining),
          yearsOfService: yearsBetween(e.dateOfJoining, now),
        })),
      };
    },
  },
  {
    key: "diversity-gender",
    label: "Diversity / Gender Ratio",
    description: "Gender distribution by department for active employees.",
    category: "Organization",
    async run({ orgId }) {
      const emps = await prisma.employee.findMany({
        where: { orgId, deletedAt: null, status: { in: ["Active", "OnLeave", "OnNotice"] } },
        select: { gender: true, department: { select: { name: true } } },
      });
      const map = new Map<string, { male: number; female: number; other: number; total: number }>();
      for (const e of emps) {
        const k = e.department?.name ?? "(Unassigned)";
        const row = map.get(k) ?? { male: 0, female: 0, other: 0, total: 0 };
        row.total++;
        if (e.gender === "Male") row.male++;
        else if (e.gender === "Female") row.female++;
        else row.other++;
        map.set(k, row);
      }
      return {
        title: "Diversity / Gender Ratio",
        columns: [
          { key: "department", label: "Department", width: 24 },
          { key: "male", label: "Male", width: 10 },
          { key: "female", label: "Female", width: 10 },
          { key: "other", label: "Other / NA", width: 12 },
          { key: "total", label: "Total", width: 10 },
          { key: "femalePct", label: "Female %", width: 10 },
        ],
        rows: [...map.entries()].sort((a, b) => b[1].total - a[1].total).map(([department, v]) => ({
          department,
          male: v.male,
          female: v.female,
          other: v.other,
          total: v.total,
          femalePct: v.total ? Math.round((v.female / v.total) * 100) : 0,
        })),
      };
    },
  },
  {
    key: "reporting-hierarchy",
    label: "Reporting Hierarchy",
    description: "Employee-to-manager mapping for org-chart export.",
    category: "Organization",
    async run({ orgId }) {
      const emps = await prisma.employee.findMany({
        where: { orgId, deletedAt: null, status: { in: ["Active", "OnLeave", "OnNotice"] } },
        include: { department: { select: { name: true } }, designation: { select: { title: true } } },
        orderBy: { employeeCode: "asc" },
      });
      const mgrs = await managerMap(orgId, emps.map((e) => e.reportingManagerId));
      return {
        title: "Reporting Hierarchy",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "designation", label: "Designation", width: 20 },
          { key: "department", label: "Department", width: 18 },
          { key: "manager", label: "Reports To", width: 24 },
        ],
        rows: emps.map((e) => ({
          code: e.employeeCode,
          name: fullName(e),
          designation: e.designation?.title ?? "",
          department: e.department?.name ?? "",
          manager: e.reportingManagerId ? mgrs.get(e.reportingManagerId) ?? "" : "(Top level)",
        })),
      };
    },
  },
  {
    key: "statutory-ids-bank",
    label: "Statutory IDs & Bank Details",
    description: "PAN, Aadhaar, UAN, PF, ESI and primary bank account — payroll-setup audit.",
    category: "Organization",
    async run({ orgId }) {
      const emps = await prisma.employee.findMany({
        where: { orgId, deletedAt: null, status: { in: ["Active", "OnLeave", "OnNotice"] } },
        orderBy: { employeeCode: "asc" },
      });
      return {
        title: "Statutory IDs & Bank Details",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "pan", label: "PAN", width: 14 },
          { key: "aadhaar", label: "Aadhaar", width: 16 },
          { key: "uan", label: "UAN", width: 16 },
          { key: "pf", label: "PF Account No.", width: 20 },
          { key: "esi", label: "ESI No.", width: 16 },
          { key: "bank", label: "Bank", width: 18 },
          { key: "bankAcc", label: "Account No.", width: 18 },
          { key: "ifsc", label: "IFSC", width: 14 },
        ],
        rows: emps.map((e) => {
          const b = primaryBank(e.bankAccounts);
          return {
            code: e.employeeCode,
            name: fullName(e),
            pan: e.panNumber ?? "",
            aadhaar: e.aadhaarNumber ?? "",
            uan: e.uanNumber ?? "",
            pf: e.pfAccountNumber ?? "",
            esi: e.esiNumber ?? "",
            bank: b.bank,
            bankAcc: b.acc,
            ifsc: b.ifsc,
          };
        }),
      };
    },
  },
];
