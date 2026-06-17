import { prisma } from "@/lib/prisma";
import type { ReportDefinition } from "../types";
import { fmtDate, fullName, num } from "../format";
import { getScopedPayslips, sumByCategory, employeeBasics, type ScopedLine } from "../payroll-data";

// Aggregate gross + TDS per employee across the scoped payslips. Shared by the
// TDS / 24Q / Form-16 reports which differ only in framing.
async function tdsByEmployee(ctx: Parameters<ReportDefinition["run"]>[0]) {
  const { payslips, empMap } = await getScopedPayslips(ctx);
  const agg = new Map<string, { gross: number; tds: number }>();
  for (const p of payslips) {
    const a = agg.get(p.employeeId) ?? { gross: 0, tds: 0 };
    a.gross += num(p.grossEarnings);
    a.tds += sumByCategory(p.lines as ScopedLine[], "IncomeTax");
    agg.set(p.employeeId, a);
  }
  return [...agg.entries()].map(([id, v]) => {
    const e = empMap.get(id);
    return { code: e?.employeeCode ?? "", name: fullName(e), pan: e?.panNumber ?? "", gross: Math.round(v.gross), tds: Math.round(v.tds) };
  });
}

export const taxReports: ReportDefinition[] = [
  {
    key: "tds-computation",
    label: "TDS Computation",
    description: "Gross paid and TDS deducted per employee for the scoped period.",
    category: "Tax",
    usesDateRange: true,
    async run(ctx) {
      const rows = await tdsByEmployee(ctx);
      if (rows.length) rows.push({ code: "TOTAL", name: `${rows.length} employees`, pan: "", gross: rows.reduce((s, r) => s + r.gross, 0), tds: rows.reduce((s, r) => s + r.tds, 0) });
      return {
        title: "TDS Computation",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 24 },
          { key: "pan", label: "PAN", width: 14 },
          { key: "gross", label: "Gross Paid", width: 16, money: true },
          { key: "tds", label: "TDS Deducted", width: 16, money: true },
        ],
        rows,
      };
    },
  },
  {
    key: "form-24q",
    label: "Form 24Q Annexure",
    description: "Deductee-wise salary and TDS for the quarterly 24Q return (set From/To to the quarter).",
    category: "Tax",
    usesDateRange: true,
    async run(ctx) {
      const base = await tdsByEmployee(ctx);
      const rows = base.map((r) => ({ pan: r.pan, code: r.code, name: r.name, section: "192", gross: r.gross, tds: r.tds }));
      if (rows.length) rows.push({ pan: "", code: "TOTAL", name: `${rows.length} deductees`, section: "", gross: rows.reduce((s, r) => s + r.gross, 0), tds: rows.reduce((s, r) => s + r.tds, 0) });
      return {
        title: "Form 24Q Annexure",
        columns: [
          { key: "pan", label: "PAN", width: 14 },
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Deductee Name", width: 24 },
          { key: "section", label: "Section", width: 10 },
          { key: "gross", label: "Amount Paid", width: 16, money: true },
          { key: "tds", label: "TDS Deducted", width: 16, money: true },
        ],
        rows,
      };
    },
  },
  {
    key: "form-16-partb",
    label: "Form 16 (Part B) Data",
    description: "Annual gross salary and total TDS per employee (set From/To to the financial year).",
    category: "Tax",
    usesDateRange: true,
    async run(ctx) {
      const rows = await tdsByEmployee(ctx);
      return {
        title: "Form 16 (Part B) Data",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 24 },
          { key: "pan", label: "PAN", width: 14 },
          { key: "gross", label: "Gross Salary", width: 16, money: true },
          { key: "tds", label: "Total TDS", width: 16, money: true },
        ],
        rows,
      };
    },
  },
  {
    key: "form-12bb",
    label: "Investment Declaration (Form 12BB)",
    description: "Employee tax declarations: HRA rent, LTA, home-loan interest and 80C/80D/80E/80G.",
    category: "Tax",
    async run({ orgId }) {
      const decls = await prisma.form12BBDeclaration.findMany({ where: { orgId, deletedAt: null }, orderBy: { createdAt: "desc" } });
      const empMap = await employeeBasics(orgId, decls.map((d) => d.employeeId));
      return {
        title: "Investment Declaration (Form 12BB)",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "fy", label: "FY", width: 10 },
          { key: "rentPaid", label: "Rent Paid", width: 14, money: true },
          { key: "lta", label: "LTA", width: 12, money: true },
          { key: "homeLoan", label: "Home Loan Int.", width: 14, money: true },
          { key: "s80c", label: "80C", width: 12, money: true },
          { key: "s80d", label: "80D", width: 12, money: true },
          { key: "s80e", label: "80E", width: 12, money: true },
          { key: "s80g", label: "80G", width: 12, money: true },
          { key: "status", label: "Status", width: 12 },
        ],
        rows: decls.map((d) => {
          const e = empMap.get(d.employeeId);
          return {
            code: e?.employeeCode ?? "", name: fullName(e), fy: d.financialYear,
            rentPaid: num(d.rentPaid), lta: num(d.ltaAmount), homeLoan: num(d.homeLoanInterest),
            s80c: num(d.section80C), s80d: num(d.section80D), s80e: num(d.section80E), s80g: num(d.section80G),
            status: d.status,
          };
        }),
      };
    },
  },
  {
    key: "investment-proof-status",
    label: "Investment Proof Status",
    description: "Declared vs proof vs approved amounts per investment, with review status.",
    category: "Tax",
    async run({ orgId }) {
      const proofs = await prisma.investmentProof.findMany({ where: { orgId, deletedAt: null }, orderBy: { createdAt: "desc" } });
      const empMap = await employeeBasics(orgId, proofs.map((p) => p.employeeId));
      return {
        title: "Investment Proof Status",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "fy", label: "FY", width: 10 },
          { key: "section", label: "Section", width: 10 },
          { key: "type", label: "Investment Type", width: 22 },
          { key: "declared", label: "Declared", width: 14, money: true },
          { key: "proof", label: "Proof", width: 14, money: true },
          { key: "approved", label: "Approved", width: 14, money: true },
          { key: "status", label: "Status", width: 14 },
        ],
        rows: proofs.map((p) => {
          const e = empMap.get(p.employeeId);
          return {
            code: e?.employeeCode ?? "", name: fullName(e), fy: p.financialYear, section: p.section, type: p.investmentType,
            declared: num(p.declaredAmount), proof: num(p.proofAmount), approved: p.approvedAmount == null ? "" : num(p.approvedAmount), status: p.status,
          };
        }),
      };
    },
  },
  {
    key: "tds-override",
    label: "TDS Override / Shortfall",
    description: "Manual TDS overrides with shortfall and recovery strategy.",
    category: "Tax",
    async run({ orgId }) {
      const ovs = await prisma.tdsOverride.findMany({ where: { orgId, deletedAt: null }, orderBy: { createdAt: "desc" } });
      const empMap = await employeeBasics(orgId, ovs.map((o) => o.employeeId));
      return {
        title: "TDS Override / Shortfall",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "fy", label: "FY", width: 12 },
          { key: "original", label: "Original TDS", width: 14, money: true },
          { key: "override", label: "Override TDS", width: 14, money: true },
          { key: "shortfall", label: "Shortfall", width: 14, money: true },
          { key: "strategy", label: "Recovery", width: 16 },
          { key: "months", label: "Months", width: 10 },
          { key: "status", label: "Status", width: 12 },
        ],
        rows: ovs.map((o) => {
          const e = empMap.get(o.employeeId);
          return {
            code: e?.employeeCode ?? "", name: fullName(e), fy: o.fy,
            original: num(o.originalTds), override: num(o.overrideTds), shortfall: num(o.shortfall),
            strategy: o.recoveryStrategy, months: o.recoveryMonths, status: o.status,
          };
        }),
      };
    },
  },
  {
    key: "donations-80g",
    label: "80G Donations",
    description: "Section 80G donations with exemption percentage and verification status.",
    category: "Tax",
    async run({ orgId }) {
      const dons = await prisma.donation.findMany({ where: { orgId, deletedAt: null }, orderBy: { donationDate: "desc" } });
      const empMap = await employeeBasics(orgId, dons.map((d) => d.employeeId));
      return {
        title: "80G Donations",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "fy", label: "FY", width: 10 },
          { key: "donee", label: "Donee", width: 24 },
          { key: "date", label: "Donation Date", width: 14 },
          { key: "amount", label: "Amount", width: 14, money: true },
          { key: "exemptPct", label: "Exemption %", width: 12 },
          { key: "exemptAmount", label: "Exempt Amount", width: 14, money: true },
          { key: "status", label: "Status", width: 12 },
        ],
        rows: dons.map((d) => {
          const e = empMap.get(d.employeeId);
          return {
            code: e?.employeeCode ?? "", name: fullName(e), fy: d.financialYear, donee: d.doneeName,
            date: fmtDate(d.donationDate), amount: num(d.amount), exemptPct: num(d.exemptionPercent),
            exemptAmount: d.exemptAmount == null ? "" : num(d.exemptAmount), status: d.status,
          };
        }),
      };
    },
  },
];
