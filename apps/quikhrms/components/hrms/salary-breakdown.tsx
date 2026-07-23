"use client";

import { Info } from "lucide-react";
import type { RefSalaryTemplateComponent, SalaryAmountType } from "@/lib/hooks/use-ref-data";

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Calculation types that contribute a percentage toward the 100% CTC total. */
const PERCENT_TYPES: SalaryAmountType[] = ["PercentOfCTC", "PercentOfGross", "PercentOfBasic"];

function labelForType(t: SalaryAmountType) {
  switch (t) {
    case "Fixed": return "Fixed";
    case "PercentOfBasic": return "% of Basic";
    case "PercentOfCTC": return "% of CTC";
    case "PercentOfGross": return "% of Gross";
    case "Formula": return "Formula";
  }
}

/** Monthly amount for one component — mirrors the salary-template editor. */
function calcMonthly(c: RefSalaryTemplateComponent, monthlyCTC: number, basicMonthly: number): number {
  const v = Number(c.amountValue) || 0;
  switch (c.amountType) {
    case "Fixed": return v;
    case "PercentOfCTC": return (monthlyCTC * v) / 100;
    case "PercentOfBasic": return (basicMonthly * v) / 100;
    case "PercentOfGross": return (monthlyCTC * v) / 100;
    default: return 0;
  }
}

interface Props {
  components: RefSalaryTemplateComponent[];
  /** Annual CTC in rupees (e.g. ctcLpa * 100000). */
  annualCTC: number;
}

/**
 * Read-only salary breakdown, computed from a template's components + an annual
 * CTC. Groups rows into Earnings / Reimbursements / Benefits / Deductions with a
 * balancing component and a Cost to Company total — same math as the template
 * editor, so what you preview here is what gets saved on the employee.
 */
export function SalaryBreakdown({ components, annualCTC }: Props) {
  if (!components?.length) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-500">
        This template has no salary components configured yet.
      </div>
    );
  }

  const monthlyCTC = annualCTC / 12;
  const basicRow = components.find((c) => c.component?.category === "Basic");
  const basicMonthly = basicRow ? calcMonthly(basicRow, monthlyCTC, 0) : 0;

  const computed = components.map((c) => {
    const monthly = calcMonthly(c, monthlyCTC, basicMonthly);
    return { ...c, monthly, annual: monthly * 12 };
  });

  const earningRows = computed.filter((r) => !r.component || r.component.type === "Earning");
  const reimbursementRows = computed.filter((r) => r.component?.type === "Reimbursement");
  const benefitRows = computed.filter((r) => r.component?.type === "Benefit");
  const deductionRows = computed.filter((r) => r.component?.type === "Deduction");

  const earningsSum = earningRows.reduce((s, r) => s + r.monthly, 0);
  const reimbursementsSum = reimbursementRows.reduce((s, r) => s + r.monthly, 0);
  const benefitsSum = benefitRows.reduce((s, r) => s + r.monthly, 0);
  const deductionsSum = deductionRows.reduce((s, r) => s + r.monthly, 0);
  // Only Earnings consume the CTC pool; the balancing component fills the rest.
  const fixedAllowanceMonthly = Math.max(0, monthlyCTC - earningsSum);
  const totalMonthly = earningsSum + fixedAllowanceMonthly;

  const percentSum = components
    .filter((c) => PERCENT_TYPES.includes(c.amountType))
    .reduce((s, c) => s + (Number(c.amountValue) || 0), 0);
  const balancingPct = Math.max(0, 100 - percentSum);

  const hasCTC = annualCTC > 0;

  type ComputedRow = (typeof computed)[number];
  const renderRow = (r: ComputedRow) => (
    <tr key={r.componentId} className="border-b border-gray-50">
      <td className="py-2.5 px-3">
        <p className="text-gray-900 font-medium flex items-center gap-2">
          {r.component?.name ?? "—"}
          <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold text-gray-600 bg-gray-100 rounded">
            {r.component?.code ?? ""}
          </span>
        </p>
      </td>
      <td className="py-2.5 px-3 text-gray-600">
        {r.amountType === "Fixed"
          ? `₹${INR.format(Number(r.amountValue) || 0)}`
          : r.amountType === "Formula"
            ? "Formula"
            : `${Number(r.amountValue) || 0}% · ${labelForType(r.amountType)}`}
      </td>
      <td className="py-2.5 px-3 text-right text-gray-900">{hasCTC ? INR.format(Math.round(r.monthly)) : "—"}</td>
      <td className="py-2.5 px-3 text-right pr-4 text-gray-900">{hasCTC ? INR.format(Math.round(r.annual)) : "—"}</td>
    </tr>
  );

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50/60">
        <span className="text-xs font-semibold text-gray-700">Salary Breakdown</span>
        {!hasCTC && (
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-600">
            <Info size={11} /> Enter CTC to see amounts
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] font-bold text-gray-500 uppercase tracking-wider bg-[#dcfce7]/60 border-b border-gray-200">
              <th className="text-left py-2 px-3 w-2/5">Component</th>
              <th className="text-left py-2 px-3">Calculation</th>
              <th className="text-right py-2 px-3">Monthly</th>
              <th className="text-right py-2 px-3 pr-4">Annual</th>
            </tr>
          </thead>
          <tbody>
            {/* ── EARNINGS — always rendered, always has a balancing component ── */}
            <tr className="border-b border-gray-100 bg-gray-50/40">
              <td colSpan={4} className="py-1.5 px-3 font-semibold text-gray-800">Earnings</td>
            </tr>
            {earningRows.map(renderRow)}
            <tr className="border-b border-gray-50 bg-green-50/30">
              <td className="py-2.5 px-3">
                <p className="text-gray-900 font-medium flex items-center gap-1">
                  Balancing Component <Info size={11} className="text-gray-400" />
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">Remaining % to reach 100% of CTC</p>
              </td>
              <td className="py-2.5 px-3 text-gray-600">{Number(balancingPct.toFixed(2))}% of CTC</td>
              <td className="py-2.5 px-3 text-right text-gray-900">{hasCTC ? INR.format(Math.round(fixedAllowanceMonthly)) : "—"}</td>
              <td className="py-2.5 px-3 text-right pr-4 text-gray-900">{hasCTC ? INR.format(Math.round(fixedAllowanceMonthly * 12)) : "—"}</td>
            </tr>

            {/* ── REIMBURSEMENTS — caps, paid against bills, on top of CTC ── */}
            {reimbursementRows.length > 0 && (
              <>
                <tr className="border-b border-gray-100 bg-gray-50/40">
                  <td colSpan={4} className="py-1.5 px-3 font-semibold text-gray-800">
                    Reimbursements
                    <span className="ml-2 text-[10px] font-normal text-gray-500">monthly caps · paid against bills</span>
                  </td>
                </tr>
                {reimbursementRows.map(renderRow)}
                <tr className="border-b border-gray-50 bg-gray-50/20">
                  <td colSpan={2} className="py-2 px-3 text-xs text-gray-500 italic">Total reimbursement allowance</td>
                  <td className="py-2 px-3 text-right text-gray-700 font-medium">{hasCTC ? INR.format(Math.round(reimbursementsSum)) : "—"}</td>
                  <td className="py-2 px-3 text-right pr-4 text-gray-700 font-medium">{hasCTC ? INR.format(Math.round(reimbursementsSum * 12)) : "—"}</td>
                </tr>
              </>
            )}

            {/* ── BENEFITS — non-cash perquisites ── */}
            {benefitRows.length > 0 && (
              <>
                <tr className="border-b border-gray-100 bg-gray-50/40">
                  <td colSpan={4} className="py-1.5 px-3 font-semibold text-gray-800">
                    Benefits
                    <span className="ml-2 text-[10px] font-normal text-gray-500">non-cash perquisites</span>
                  </td>
                </tr>
                {benefitRows.map(renderRow)}
                <tr className="border-b border-gray-50 bg-gray-50/20">
                  <td colSpan={2} className="py-2 px-3 text-xs text-gray-500 italic">Total benefits</td>
                  <td className="py-2 px-3 text-right text-gray-700 font-medium">{hasCTC ? INR.format(Math.round(benefitsSum)) : "—"}</td>
                  <td className="py-2 px-3 text-right pr-4 text-gray-700 font-medium">{hasCTC ? INR.format(Math.round(benefitsSum * 12)) : "—"}</td>
                </tr>
              </>
            )}

            {/* ── DEDUCTIONS — recoveries from payslip ── */}
            {deductionRows.length > 0 && (
              <>
                <tr className="border-b border-gray-100 bg-gray-50/40">
                  <td colSpan={4} className="py-1.5 px-3 font-semibold text-gray-800">
                    Deductions
                    <span className="ml-2 text-[10px] font-normal text-gray-500">recoveries from payslip</span>
                  </td>
                </tr>
                {deductionRows.map(renderRow)}
                <tr className="border-b border-gray-50 bg-gray-50/20">
                  <td colSpan={2} className="py-2 px-3 text-xs text-gray-500 italic">Total deductions</td>
                  <td className="py-2 px-3 text-right text-rose-700 font-medium">{hasCTC ? `−${INR.format(Math.round(deductionsSum))}` : "—"}</td>
                  <td className="py-2 px-3 text-right pr-4 text-rose-700 font-medium">{hasCTC ? `−${INR.format(Math.round(deductionsSum * 12))}` : "—"}</td>
                </tr>
              </>
            )}

            <tr className="bg-[#dcfce7]/70 font-semibold">
              <td className="py-2.5 px-3 text-gray-900" colSpan={2}>Cost to Company</td>
              <td className="py-2.5 px-3 text-right text-gray-900">{hasCTC ? `₹${INR.format(Math.round(totalMonthly))}` : "—"}</td>
              <td className="py-2.5 px-3 text-right pr-4 text-gray-900">{hasCTC ? `₹${INR.format(Math.round(totalMonthly * 12))}` : "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
