import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { internalError, notFound, validationError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";
import { getChallanFundingForPeriods, type ChallanFunding } from "@/lib/services/tds-liability";
import { loadPartB, fyBounds } from "@/lib/services/form16-pdf";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function isoDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function quarterFromDate(d: Date): { q: "Q1" | "Q2" | "Q3" | "Q4"; start: Date; end: Date; fy: string } {
  const m = d.getMonth(); // 0-indexed
  const y = d.getFullYear();
  if (m >= 3 && m <= 5) return { q: "Q1", start: new Date(y, 3, 1), end: new Date(y, 5, 30), fy: `${y}-${(y + 1) % 100}` };
  if (m >= 6 && m <= 8) return { q: "Q2", start: new Date(y, 6, 1), end: new Date(y, 8, 30), fy: `${y}-${(y + 1) % 100}` };
  if (m >= 9 && m <= 11) return { q: "Q3", start: new Date(y, 9, 1), end: new Date(y, 11, 31), fy: `${y}-${(y + 1) % 100}` };
  return { q: "Q4", start: new Date(y, 0, 1), end: new Date(y, 2, 31), fy: `${y - 1}-${y % 100}` };
}

/**
 * Split an employee's monthly TDS amount across the challans that funded the
 * period. Rules:
 *   - 0 challans: single row with no CIN (under-deposited; flag in remarks).
 *   - 1+ challans, sum >= deducted: split proportionally to each challan's
 *     allocatedAmount share. Last row absorbs the rounding remainder.
 *   - 1+ challans, sum < deducted: same proportional split for the covered
 *     portion, plus a "shortfall" row with no CIN for the uncovered portion.
 *
 * Caller passes the period-wide totalDeducted so we can detect under-deposit.
 * Returns an array of { challan, amount } tuples, where challan=null for
 * uncovered/shortfall rows.
 */
function splitTdsAcrossChallans(
  employeeTds: number,
  funding: ChallanFunding[],
  periodTotalDeducted: number,
): { challan: ChallanFunding | null; amount: number }[] {
  if (employeeTds <= 0) return [];
  if (funding.length === 0) {
    return [{ challan: null, amount: r2(employeeTds) }];
  }

  const totalAllocated = funding.reduce((s, f) => s + f.allocatedAmount, 0);
  if (totalAllocated <= 0) {
    return [{ challan: null, amount: r2(employeeTds) }];
  }

  // Coverage = how much of the period's deduction the allocations cover.
  // Capped at 1 because over-allocation doesn't get reported in 24Q
  // (excess challan capacity has nowhere to go in Annexure I).
  const coverageRatio = Math.min(1, totalAllocated / periodTotalDeducted);
  const covered = employeeTds * coverageRatio;
  const shortfall = employeeTds - covered;

  // Split the covered portion proportionally across challans.
  const rows: { challan: ChallanFunding | null; amount: number }[] = [];
  let cumulative = 0;
  for (let i = 0; i < funding.length; i++) {
    const f = funding[i];
    const isLast = i === funding.length - 1;
    const exact = covered * (f.allocatedAmount / totalAllocated);
    // Last row absorbs accumulated rounding error against `covered`.
    const amount = isLast ? r2(covered - cumulative) : r2(exact);
    cumulative += amount;
    if (amount > 0) rows.push({ challan: f, amount });
  }

  if (shortfall > 0.005) {
    rows.push({ challan: null, amount: r2(shortfall) });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Annexure I CSV row shape
// ---------------------------------------------------------------------------

const ANNEXURE_I_HEADER = [
  "Sl.No",
  "Employee Code",
  "Deductee Name",
  "PAN",
  "Section",
  "Date of Payment/Credit",
  "Amount Paid/Credited",
  "TDS Deducted",
  "Surcharge",
  "Education Cess",
  "Total Tax Deducted",
  "Date of Deduction",
  "Date of Deposit",
  "BSR Code",
  "Challan Serial No (CIN)",
  "Status",
  "Remarks",
] as const;

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const GET = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const url = new URL(req.url);
    const wholeQuarter = url.searchParams.get("scope") === "quarter"; // default: this run only
    const annexure = (url.searchParams.get("annexure") ?? "I").toUpperCase();

    const run = await prisma.payRun.findFirst({
      where: { id, orgId, deletedAt: null },
      select: { id: true, periodStart: true, periodEnd: true, payDate: true, status: true },
    });
    if (!run) return notFound("Pay run not found");
    if (run.status !== "Approved" && run.status !== "Paid") {
      return validationError("Form 24Q can only be generated for Approved or Paid pay runs");
    }

    // ── Annexure II — FY-wide annual statement (filed with Q4 24Q return) ──
    if (annexure === "II") {
      return generateAnnexureII({ orgId, userId, runId: id, runPeriodStart: run.periodStart });
    }

    const [company, taxDetails] = await Promise.all([
      prisma.companySettings.findUnique({
        where: { orgId },
        select: { companyName: true, pan: true },
      }),
      prisma.payrollTaxDetails.findUnique({
        where: { orgId },
        select: { tan: true, pan: true },
      }),
    ]);

    const qInfo = quarterFromDate(run.periodStart);
    const periodStart = wholeQuarter ? qInfo.start : run.periodStart;
    const periodEnd = wholeQuarter ? qInfo.end : run.periodEnd;

    // Pull every payslip in scope along with their IncomeTax (TDS) lines.
    const payslips = await prisma.payslip.findMany({
      where: {
        orgId, deletedAt: null,
        periodStart: { gte: periodStart },
        periodEnd: { lte: periodEnd },
        status: { in: ["Released", "Generated"] },
      },
      include: { lines: { where: { category: "IncomeTax" } } },
      orderBy: { periodStart: "asc" },
    });
    if (payslips.length === 0) return validationError("No payslips found for the selected period");

    // Employee lookup.
    const empIds = [...new Set(payslips.map((p) => p.employeeId))];
    const employees = await prisma.employee.findMany({
      where: { orgId, deletedAt: null, id: { in: empIds } },
      select: { id: true, employeeCode: true, firstName: true, lastName: true, panNumber: true },
    });
    const empMap = new Map(employees.map((e) => [e.id, e]));

    // Each payslip belongs to one (year, month) period — collect the set so we
    // can fetch challan funding in one round-trip.
    const periodSet = new Map<string, { year: number; month: number }>();
    for (const p of payslips) {
      const y = p.periodStart.getUTCFullYear();
      const m = p.periodStart.getUTCMonth() + 1;
      periodSet.set(`${y}-${m}`, { year: y, month: m });
    }
    const fundingMap = await getChallanFundingForPeriods(orgId, [...periodSet.values()]);

    // Aggregate TDS per (employee, period) so a single employee's June TDS is
    // ONE bucket even if the same period has multiple payslips (FNF, arrears).
    interface Bucket {
      employeeId: string;
      year: number;
      month: number;
      tds: number;
      grossPaid: number;
      lastDate: Date;
    }
    const byEmpPeriod = new Map<string, Bucket>();
    for (const p of payslips) {
      const y = p.periodStart.getUTCFullYear();
      const m = p.periodStart.getUTCMonth() + 1;
      const key = `${p.employeeId}::${y}-${m}`;
      const tds = p.lines.reduce((s, l) => s + Number(l.amount), 0);
      const prev = byEmpPeriod.get(key) ?? {
        employeeId: p.employeeId,
        year: y,
        month: m,
        tds: 0,
        grossPaid: 0,
        lastDate: p.periodEnd,
      };
      prev.tds += tds;
      prev.grossPaid += Number(p.grossEarnings);
      if (p.periodEnd > prev.lastDate) prev.lastDate = p.periodEnd;
      byEmpPeriod.set(key, prev);
    }

    // Per-period totalDeducted (for proportional splits and reconciliation).
    const periodTotalDeducted = new Map<string, number>();
    for (const b of byEmpPeriod.values()) {
      const key = `${b.year}-${b.month}`;
      periodTotalDeducted.set(key, (periodTotalDeducted.get(key) ?? 0) + b.tds);
    }

    // ── Build CSV ──
    const lines: string[] = [];
    lines.push("# Form 24Q — Annexure I (Quarterly e-TDS Statement, Salary u/s 192)");
    lines.push(`# Deductor,${csvEscape(company?.companyName ?? "")}`);
    lines.push(`# TAN,${csvEscape(taxDetails?.tan ?? "")}`);
    lines.push(`# PAN,${csvEscape(taxDetails?.pan ?? company?.pan ?? "")}`);
    lines.push(`# Financial Year,${qInfo.fy}`);
    lines.push(`# Quarter,${qInfo.q}`);
    lines.push(`# Period,${isoDate(periodStart)} to ${isoDate(periodEnd)}`);
    lines.push(`# Scope,${wholeQuarter ? "Entire Quarter" : "Single Run"}`);
    lines.push(`# Generated,${new Date().toISOString()}`);
    lines.push("");
    lines.push(ANNEXURE_I_HEADER.join(","));

    let slNo = 1;
    let totalTds = 0;
    let totalGross = 0;
    let totalChallanReported = 0; // sum of TDS amounts attached to a real CIN
    let totalShortfall = 0;       // sum of TDS amounts with no CIN

    // Sort buckets by employee code then period for a readable file.
    const sorted = [...byEmpPeriod.values()].sort((a, b) => {
      const ec = (empMap.get(a.employeeId)?.employeeCode ?? "").localeCompare(
        empMap.get(b.employeeId)?.employeeCode ?? "",
      );
      if (ec !== 0) return ec;
      return a.year * 12 + a.month - (b.year * 12 + b.month);
    });

    for (const b of sorted) {
      const emp = empMap.get(b.employeeId);
      if (!emp || b.tds <= 0) continue;
      const name = `${emp.firstName} ${emp.lastName}`.trim();
      const periodKey = `${b.year}-${b.month}-92B`;
      const funding = fundingMap.get(periodKey) ?? [];
      const periodDeducted = periodTotalDeducted.get(`${b.year}-${b.month}`) ?? b.tds;

      const splits = splitTdsAcrossChallans(b.tds, funding, periodDeducted);
      const paidDate = isoDate(b.lastDate);

      totalTds += b.tds;
      totalGross += b.grossPaid;

      for (const split of splits) {
        const c = split.challan;
        const isShortfall = c === null;
        if (isShortfall) totalShortfall += split.amount;
        else totalChallanReported += split.amount;

        lines.push([
          slNo++,
          csvEscape(emp.employeeCode),
          csvEscape(name),
          csvEscape(emp.panNumber ?? ""),
          "192",
          paidDate,
          // Gross is reported once per employee/period — emit on the first
          // split row only, blank thereafter, so totals don't double-count.
          split === splits[0] ? b.grossPaid.toFixed(2) : "0.00",
          split.amount.toFixed(2),
          "0.00", // Surcharge — included inside TDS for monthly salary TDS
          "0.00", // Cess — same
          split.amount.toFixed(2),
          paidDate,
          c ? isoDate(c.depositDate) : "",
          c ? c.bsrCode : "",
          c ? c.cin : "",
          emp.panNumber ? "" : "C", // C = PAN not available
          isShortfall ? "TDS not yet deposited (challan pending)" : "",
        ].join(","));
      }
    }

    // ── Footer reconciliation ──
    const totalAllocated = [...fundingMap.values()]
      .flat()
      .reduce((s, f) => s + f.allocatedAmount, 0);
    const balance = totalTds - totalChallanReported;

    lines.push("");
    lines.push(`# Total Gross Paid,${totalGross.toFixed(2)}`);
    lines.push(`# Total TDS Deducted,${totalTds.toFixed(2)}`);
    lines.push(`# Total TDS Reported Against Challans,${totalChallanReported.toFixed(2)}`);
    lines.push(`# Total Allocated to Periods (incl. unused capacity),${totalAllocated.toFixed(2)}`);
    lines.push(`# Pending Deposit (shortfall rows),${totalShortfall.toFixed(2)}`);
    lines.push(`# Reconciliation Status,${
      Math.abs(balance) < 0.01
        ? "BALANCED — every rupee deducted is tied to a deposited challan"
        : balance > 0
          ? `SHORTFALL ₹${balance.toFixed(2)} — deduct more challans before filing`
          : `EXCESS ₹${Math.abs(balance).toFixed(2)} — investigate over-allocation`
    }`);

    const csv = lines.join("\n");

    await createAuditLog({
      orgId, userId, action: "Export", entityType: "PayRun", entityId: id,
      changes: {
        artifact: "Form24Q",
        quarter: qInfo.q,
        fy: qInfo.fy,
        scope: wholeQuarter ? "quarter" : "run",
        deducteeRows: slNo - 1,
        totalTds,
        totalShortfall,
      },
    });

    const fileName = `Form24Q-${qInfo.fy}-${qInfo.q}-${wholeQuarter ? "Quarter" : "Run"}.txt`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("GET /payroll/runs/[id]/form24q error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

// ---------------------------------------------------------------------------
// Annexure II — per-employee FY annual statement
// ---------------------------------------------------------------------------

const ANNEXURE_II_HEADER = [
  "Sl.No",
  "PAN",
  "Employee Name",
  "Employee Code",
  "Designation",
  "Department",
  "Tax Regime",
  "Period From",
  "Period To",
  "Gross Salary u/s 17(1)",
  "Allowances Exempt u/s 10",
  "Standard Deduction u/s 16(ia)",
  "Professional Tax u/s 16(iii)",
  "Income Chargeable under Salaries",
  "Chapter VI-A — Aggregate Deductions",
  "Total Taxable Income",
  "Tax on Total Income",
  "Rebate u/s 87A",
  "Tax After Rebate",
  "Surcharge",
  "Health & Education Cess",
  "Total Tax Liability",
  "Total TDS Deducted (FY)",
  "Balance Payable",
  "Refund Due",
  "Status",
] as const;

/**
 * Derive the FY from a run period the same way quarterFromDate does, but with
 * a full 4-digit end year so the filename + headers look right.
 *
 * "2026-27" → "2026-2027"
 */
function fullFyString(fy: string): string {
  const [start, endSuffix] = fy.split("-");
  const startN = Number(start);
  if (!Number.isFinite(startN)) return fy;
  const endN = startN + 1;
  return `${startN}-${endN}`.replace(/^(\d{4})-(\d+)$/, (_, a, b) => `${a}-${b.length === 2 ? `${a.slice(0, 2)}${b}` : b}`)
    || `${start}-${endSuffix}`;
}

async function generateAnnexureII(args: {
  orgId: string;
  userId: string;
  runId: string;
  runPeriodStart: Date;
}): Promise<NextResponse> {
  const { orgId, userId, runId, runPeriodStart } = args;

  // Derive FY from the run's period (Apr-Mar Indian FY).
  const m = runPeriodStart.getUTCMonth();
  const y = runPeriodStart.getUTCFullYear();
  const fyStart = m >= 3 ? y : y - 1;
  const fy = `${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")}`;
  const { start: fyBoundStart, end: fyBoundEnd } = fyBounds(fy);

  const [company, taxDetails] = await Promise.all([
    prisma.companySettings.findUnique({
      where: { orgId },
      select: { companyName: true, pan: true },
    }),
    prisma.payrollTaxDetails.findUnique({
      where: { orgId },
      select: { tan: true, pan: true },
    }),
  ]);

  // Every employee with at least one released payslip in this FY.
  const distinctEmpRows = await prisma.payslip.findMany({
    where: {
      orgId, deletedAt: null,
      status: "Released",
      periodStart: { gte: fyBoundStart, lte: fyBoundEnd },
    },
    select: { employeeId: true },
    distinct: ["employeeId"],
  });
  if (distinctEmpRows.length === 0) {
    return validationError(`No released payslips found in FY ${fy} — cannot generate Annexure II`);
  }

  // Build one Annexure II row per employee.
  const lines: string[] = [];
  lines.push("# Form 24Q — Annexure II (Annual Statement of Salary, filed with Q4 return)");
  lines.push(`# Deductor,${csvEscape(company?.companyName ?? "")}`);
  lines.push(`# TAN,${csvEscape(taxDetails?.tan ?? "")}`);
  lines.push(`# PAN,${csvEscape(taxDetails?.pan ?? company?.pan ?? "")}`);
  lines.push(`# Financial Year,${fy}`);
  lines.push(`# Generated,${new Date().toISOString()}`);
  lines.push(`# Note,One row per employee. Sourced from released payslips + Form 12BB declarations + approved investment proofs.`);
  lines.push("");
  lines.push(ANNEXURE_II_HEADER.join(","));

  let totalGross = 0;
  let totalTaxLiability = 0;
  let totalTds = 0;
  let totalBalancePayable = 0;
  let totalRefund = 0;
  let skipped = 0;
  let slNo = 1;

  for (const row of distinctEmpRows) {
    const partB = await loadPartB(orgId, row.employeeId, fy);
    if (!partB) {
      skipped++;
      continue;
    }

    const periodFrom = partB.employee.dateOfJoining > fyBoundStart
      ? partB.employee.dateOfJoining
      : fyBoundStart;
    const periodTo = fyBoundEnd;

    const statusFlag = partB.employee.pan ? "" : "C"; // C = PAN missing

    totalGross += partB.salary.grossSalary;
    totalTaxLiability += partB.tax.totalTaxLiability;
    totalTds += partB.tds.totalDeducted;
    totalBalancePayable += partB.tds.balanceDue;
    totalRefund += partB.tds.refundDue;

    lines.push([
      slNo++,
      csvEscape(partB.employee.pan ?? ""),
      csvEscape(partB.employee.name),
      csvEscape(partB.employee.employeeCode),
      csvEscape(partB.employee.designation ?? ""),
      csvEscape(partB.employee.department ?? ""),
      partB.regime === "OldRegime" ? "Old" : "New",
      isoDate(periodFrom),
      isoDate(periodTo),
      partB.salary.grossSalary.toFixed(2),
      partB.salary.exemptAllowances.toFixed(2),
      partB.salary.standardDeduction.toFixed(2),
      partB.salary.professionalTax.toFixed(2),
      partB.salary.netSalary.toFixed(2),
      partB.chapterVIATotal.toFixed(2),
      partB.tax.taxableIncome.toFixed(2),
      partB.tax.baseTax.toFixed(2),
      partB.tax.rebate87A.toFixed(2),
      partB.tax.taxAfterRebate.toFixed(2),
      partB.tax.surcharge.toFixed(2),
      partB.tax.educationCess.toFixed(2),
      partB.tax.totalTaxLiability.toFixed(2),
      partB.tds.totalDeducted.toFixed(2),
      partB.tds.balanceDue.toFixed(2),
      partB.tds.refundDue.toFixed(2),
      statusFlag,
    ].join(","));
  }

  // Footer reconciliation
  const netUnderDeposit = totalTaxLiability - totalTds;
  lines.push("");
  lines.push(`# Employees Reported,${slNo - 1}`);
  if (skipped > 0) lines.push(`# Employees Skipped (no payslips in FY),${skipped}`);
  lines.push(`# Total Gross Salary,${totalGross.toFixed(2)}`);
  lines.push(`# Total Tax Liability,${totalTaxLiability.toFixed(2)}`);
  lines.push(`# Total TDS Deducted (FY),${totalTds.toFixed(2)}`);
  lines.push(`# Total Balance Payable,${totalBalancePayable.toFixed(2)}`);
  lines.push(`# Total Refund Due,${totalRefund.toFixed(2)}`);
  lines.push(`# Year-end Reconciliation,${
    Math.abs(netUnderDeposit) < 1
      ? "BALANCED — TDS deducted matches annual tax liability"
      : netUnderDeposit > 0
        ? `UNDER-DEDUCTED ₹${netUnderDeposit.toFixed(2)} — recover from final payslips`
        : `OVER-DEDUCTED ₹${Math.abs(netUnderDeposit).toFixed(2)} — refund due to employees`
  }`);

  const csv = lines.join("\n");

  await createAuditLog({
    orgId, userId, action: "Export", entityType: "PayRun", entityId: runId,
    changes: {
      artifact: "Form24Q-AnnexureII",
      fy,
      employeesReported: slNo - 1,
      employeesSkipped: skipped,
      totalTaxLiability,
      totalTds,
    },
  });

  const fileName = `Form24Q-${fullFyString(fy)}-AnnexureII.txt`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
