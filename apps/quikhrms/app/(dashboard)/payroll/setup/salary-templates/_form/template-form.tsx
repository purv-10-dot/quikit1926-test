"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { FileStack, Save, Plus, Trash2, Info, X, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { useDialog } from "@/components/hrms/dialog";

type AmountType = "Fixed" | "PercentOfBasic" | "PercentOfCTC" | "PercentOfGross" | "Formula";

/** Calculation types that contribute a percentage toward the 100% total. */
const PERCENT_TYPES: AmountType[] = ["PercentOfCTC", "PercentOfGross", "PercentOfBasic"];

interface SalaryComponent {
  id: string;
  name: string;
  code: string;
  type: "Earning" | "Deduction" | "Reimbursement" | "Benefit" | "StatutoryContribution";
  category: string;
  amountType: AmountType;
  amountValue: string | number | null;
}

interface StructureComponentDraft {
  componentId: string;
  component?: SalaryComponent;
  amountType: AmountType;
  amountValue: number;
}

interface InitialValues {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  components: {
    componentId: string;
    amountType: AmountType;
    amountValue: string | number | null;
    component: SalaryComponent;
  }[];
}

const inputCls = "w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md focus:outline-none focus:ring-1 focus:ring-[#166534] focus:border-transparent";
const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function SalaryTemplateForm({ initial }: { initial?: InitialValues }) {
  const api = useApiClient();
  const qc = useQueryClient();
  const router = useRouter();
  const dialog = useDialog();

  const { data: catalogRes } = useQuery({
    queryKey: ["payroll", "salary-components", "all"],
    queryFn: () => api.get<SalaryComponent[]>("/api/v1/hrms/payroll/salary-components"),
  });
  const catalog = catalogRes?.data ?? [];
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const basicComponent = catalog.find((c) => c.category === "Basic" && c.type === "Earning");

  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [annualCTC, setAnnualCTC] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  const initialComps: StructureComponentDraft[] = useMemo(() => {
    if (initial?.components?.length) {
      return initial.components.map((c) => ({
        componentId: c.componentId,
        component: c.component,
        amountType: c.amountType,
        amountValue: c.amountValue != null ? Number(c.amountValue) : 0,
      }));
    }
    return [];
  }, [initial]);

  const [rows, setRows] = useState<StructureComponentDraft[]>(initialComps);

  const monthlyCTC = annualCTC / 12;

  // Compute per-component monthly amounts. Carry the original index so per-type
  // sub-tables can still drive setRows() on the canonical row list.
  const computed = rows.map((r, originalIdx) => {
    const basicRow = rows.find((x) => x.component?.category === "Basic");
    const basicMonthly = basicRow ? calcMonthly(basicRow, monthlyCTC, 0) : 0;
    const monthly = calcMonthly(r, monthlyCTC, basicMonthly);
    return { ...r, monthly, annual: monthly * 12, originalIdx };
  });

  // Group by type so the table can render Earnings / Reimbursements /
  // Benefits / Deductions as their own labelled sections.
  const earningRows       = computed.filter((r) => !r.component || r.component.type === "Earning");
  const reimbursementRows = computed.filter((r) => r.component?.type === "Reimbursement");
  const benefitRows       = computed.filter((r) => r.component?.type === "Benefit");
  const deductionRows     = computed.filter((r) => r.component?.type === "Deduction");

  // Only Earnings consume the CTC pool. Reimbursements/Benefits sit alongside
  // and are tracked separately (caps, not gross salary).
  const earningsSum = earningRows.reduce((s, r) => s + r.monthly, 0);
  const reimbursementsSum = reimbursementRows.reduce((s, r) => s + r.monthly, 0);
  const benefitsSum = benefitRows.reduce((s, r) => s + r.monthly, 0);
  const deductionsSum = deductionRows.reduce((s, r) => s + r.monthly, 0);
  const fixedAllowanceMonthly = Math.max(0, monthlyCTC - earningsSum);
  const totalMonthly = earningsSum + fixedAllowanceMonthly;

  // The balancing component shows the leftover percentage to reach 100%
  // (100 − sum of every percentage-based component). The amount above (CTC −
  // earnings) is the same figure in rupees.
  const percentSum = rows
    .filter((r) => PERCENT_TYPES.includes(r.amountType))
    .reduce((s, r) => s + (Number(r.amountValue) || 0), 0);
  const balancingPct = Math.max(0, 100 - percentSum);

  const saveMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      initial ? api.put(`/api/v1/hrms/payroll/salary-templates/${initial.id}`, body)
              : api.post("/api/v1/hrms/payroll/salary-templates", body),
    onSuccess: async () => {
      await qc.refetchQueries({ queryKey: ["payroll", "salary-templates"] });
      router.refresh();
      router.push("/payroll/setup/salary-templates");
    },
    meta: { suppressGlobalError: true },
    onError: (e: Error) => setErr(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setErr("Template name required");
    if (!code.trim()) return setErr("Code required");
    if (!rows.some((r) => !r.component || r.component.type === "Earning")) {
      return setErr("Add at least one Earning component (e.g. Basic)");
    }

    // Percentage components must not exceed 100% — the balancing component fills
    // any shortfall, but it can't go negative.
    if (percentSum > 100.01) {
      dialog.alertDialog({
        title: "Percentages exceed 100%",
        description:
          `Your percentage components add up to ${Number(percentSum.toFixed(2))}%.\n` +
          `Reduce them to 100% or less so the balancing component can fill the rest.`,
        variant: "danger",
      });
      return;
    }

    saveMut.mutate({
      name,
      code: code.toUpperCase(),
      description: description || null,
      isDefault,
      isActive,
      components: rows.map((r, idx) => ({
        componentId: r.componentId,
        amountType: r.amountType,
        amountValue: r.amountValue,
        sortOrder: idx,
      })),
    });
  };

  const hasBasic = rows.some((r) => r.component?.category === "Basic");
  // All addable components — every type EXCEPT StatutoryContribution
  // (those are managed automatically: EPF, ESI, etc.). Earning + Reimbursement
  // + Benefit + Deduction are all valid for templates.
  const availableComponents = catalog.filter(
    (c) =>
      c.type !== "StatutoryContribution" &&
      !rows.some((r) => r.componentId === c.id) &&
      !(hasBasic && c.category === "Basic"),
  );

  const filteredPicker = availableComponents.filter((c) => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
  });

  const openPicker = () => {
    setPickerSearch("");
    setPickerOpen(true);
  };

  const pickComponent = (c: SalaryComponent) => {
    if (rows.some((r) => r.componentId === c.id)) {
      setPickerOpen(false);
      return;
    }
    if (c.category === "Basic" && rows.some((r) => r.component?.category === "Basic")) {
      setErr("Only one Basic component allowed per template");
      setPickerOpen(false);
      return;
    }
    setRows([
      ...rows,
      {
        componentId: c.id,
        component: c,
        amountType: c.amountType,
        amountValue: c.amountValue != null ? Number(c.amountValue) : 0,
      },
    ]);
    setPickerOpen(false);
  };

  const isFullyLocked = (c?: SalaryComponent) =>
    !!c && c.amountValue != null && Number(c.amountValue) > 0;
  const isTypeLocked = (c?: SalaryComponent) => !!c && !!c.amountType;

  const labelForType = (t: AmountType) => {
    switch (t) {
      case "Fixed": return "Fixed";
      case "PercentOfBasic": return "% of Basic";
      case "PercentOfCTC": return "% of CTC";
      case "PercentOfGross": return "% of Gross";
      case "Formula": return "Formula";
    }
  };

  // Single row JSX used by every type-section in the table. Closure holds
  // `rows`, `setRows`, etc. Removal uses originalIdx so we splice the
  // correct row from the unfiltered list.
  type ComputedRow = (typeof computed)[number];
  const renderRow = (r: ComputedRow) => (
    <tr key={r.componentId + r.originalIdx} className="border-b border-gray-50">
      <td className="py-3 px-3">
        <p className="text-gray-900 font-medium flex items-center gap-2">
          {r.component?.name ?? byId.get(r.componentId)?.name ?? "—"}
          <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold text-gray-600 bg-gray-100 rounded">
            {r.component?.code ?? byId.get(r.componentId)?.code ?? ""}
          </span>
        </p>
        {r.component?.category === "Basic" && (
          <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1">
            <Info size={10} /> Baseline component — all percentages calc against this.
          </p>
        )}
      </td>
      <td className="py-3 px-3">
        {isFullyLocked(r.component) ? (
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <span className="font-medium">
              {r.amountType === "Fixed" ? `₹${INR.format(Number(r.amountValue))}` : `${r.amountValue}%`}
            </span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-600">{labelForType(r.amountType)}</span>
            <span className="ml-1 px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-bold text-gray-500 bg-gray-100 rounded">
              From catalog
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {r.amountType !== "Formula" && (
              <NumberInput
                step="0.01"
                value={typeof r.amountValue === "number" ? r.amountValue : (r.amountValue == null ? null : Number(r.amountValue))}
                onChange={(v) => setRows(rows.map((x, i) => i === r.originalIdx ? { ...x, amountValue: v ?? 0 } : x))}
                className="w-24 px-2 py-1.5 text-sm border border-[var(--border)] rounded focus:outline-none focus:ring-1 focus:ring-[#166534]"
              />
            )}
            {isTypeLocked(r.component) ? (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded whitespace-nowrap"
                title="Calculation type set in Salary Components catalog · edit there to change"
              >
                <span>{labelForType(r.amountType)}</span>
                <Info size={11} className="text-gray-400 shrink-0" />
              </span>
            ) : (
              <div className="w-32">
                <Select
                  value={r.amountType}
                  onChange={(v) => setRows(rows.map((x, i) => i === r.originalIdx ? { ...x, amountType: v as AmountType } : x))}
                  size="sm"
                  options={[
                    { value: "Fixed", label: "Fixed" },
                    { value: "PercentOfBasic", label: "% of Basic" },
                    { value: "PercentOfCTC", label: "% of CTC" },
                    { value: "PercentOfGross", label: "% of Gross" },
                  ]}
                />
              </div>
            )}
          </div>
        )}
      </td>
      <td className="py-3 px-3 text-right text-gray-900">{INR.format(Math.round(r.monthly))}</td>
      <td className="py-3 px-3 text-right pr-4 text-gray-900">{INR.format(Math.round(r.annual))}</td>
      <td className="py-3 px-3 text-right">
        <button
          type="button"
          onClick={() => setRows(rows.filter((_, i) => i !== r.originalIdx))}
          className="text-gray-400 hover:text-red-600"
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );

  return (
    <form onSubmit={submit} className="max-w-5xl mx-auto space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 px-4 py-4 border-b border-gray-100">
          <FileStack size={18} className="text-[#22c55e]" />
          <h1 className="text-base font-semibold text-gray-900">{initial ? "Edit Salary Template" : "New Salary Template"}</h1>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Template Name <span className="text-red-500">*</span>
              </label>
              <input value={name} onChange={(e) => setName(e.target.value)} required className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                rows={1}
                placeholder="Max 500 Characters"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Code <span className="text-red-500">*</span>
              </label>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required className={inputCls} />
            </div>
            <div className="flex items-end gap-4 text-sm text-gray-700">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="text-[#22c55e] rounded" />
                Default template
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="text-[#22c55e] rounded" />
                Active
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 p-4 bg-gray-50/40">
            <div className="flex items-center gap-4 mb-4">
              <label className="text-sm font-medium text-gray-800">Annual CTC</label>
              <div className="flex items-center border border-[var(--border)] rounded-md overflow-hidden bg-white w-80">
                <span className="px-3 py-2 bg-gray-50 text-gray-500 text-sm border-r border-gray-300">₹</span>
                <NumberInput
                  value={annualCTC || null}
                  onChange={(v) => setAnnualCTC(v ?? 0)}
                  className="flex-1 px-3 py-2 text-sm outline-none"
                  placeholder="0"
                />
                <span className="px-3 py-2 bg-gray-50 text-gray-500 text-sm border-l border-gray-300">per year</span>
              </div>
            </div>

            <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-table-head font-bold text-gray-500 uppercase tracking-wider bg-[#dcfce7]/60 border-b border-gray-200">
                    <th className="text-left py-2.5 px-3 w-2/5">Salary Components</th>
                    <th className="text-left py-2.5 px-3">Calculation Type</th>
                    <th className="text-right py-2.5 px-3">Monthly Amount</th>
                    <th className="text-right py-2.5 px-3 pr-4">Annual Amount</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {/* ── EARNINGS — always rendered, always has Fixed Allowance balancer ── */}
                  <tr className="border-b border-gray-100 bg-gray-50/40">
                    <td colSpan={5} className="py-2 px-3 font-semibold text-gray-800">Earnings</td>
                  </tr>
                  {earningRows.map(renderRow)}

                  <tr className="border-b border-gray-50 bg-green-50/30">
                    <td className="py-3 px-3">
                      <p className="text-gray-900 font-medium flex items-center gap-1">
                        Balancing Component <Info size={11} className="text-gray-400" />
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5">Auto — remaining percentage to reach 100% of CTC</p>
                    </td>
                    <td className="py-3 px-3 text-sm">
                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-white border border-gray-200 font-medium text-gray-700">
                        {Number(balancingPct.toFixed(2))}% of CTC
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-gray-900">{INR.format(Math.round(fixedAllowanceMonthly))}</td>
                    <td className="py-3 px-3 text-right pr-4 text-gray-900">{INR.format(Math.round(fixedAllowanceMonthly * 12))}</td>
                    <td />
                  </tr>

                  {/* ── REIMBURSEMENTS — bill-against caps, on top of CTC ── */}
                  {reimbursementRows.length > 0 && (
                    <>
                      <tr className="border-b border-gray-100 bg-gray-50/40">
                        <td colSpan={5} className="py-2 px-3 font-semibold text-gray-800">
                          Reimbursements
                          <span className="ml-2 text-[10px] font-normal text-gray-500">monthly caps · paid against bills</span>
                        </td>
                      </tr>
                      {reimbursementRows.map(renderRow)}
                      <tr className="border-b border-gray-50 bg-gray-50/20">
                        <td colSpan={2} className="py-2 px-3 text-xs text-gray-500 italic">Total reimbursement allowance</td>
                        <td className="py-2 px-3 text-right text-gray-700 font-medium">{INR.format(Math.round(reimbursementsSum))}</td>
                        <td className="py-2 px-3 text-right pr-4 text-gray-700 font-medium">{INR.format(Math.round(reimbursementsSum * 12))}</td>
                        <td />
                      </tr>
                    </>
                  )}

                  {/* ── BENEFITS — non-cash, company-provided ── */}
                  {benefitRows.length > 0 && (
                    <>
                      <tr className="border-b border-gray-100 bg-gray-50/40">
                        <td colSpan={5} className="py-2 px-3 font-semibold text-gray-800">
                          Benefits
                          <span className="ml-2 text-[10px] font-normal text-gray-500">non-cash perquisites</span>
                        </td>
                      </tr>
                      {benefitRows.map(renderRow)}
                      <tr className="border-b border-gray-50 bg-gray-50/20">
                        <td colSpan={2} className="py-2 px-3 text-xs text-gray-500 italic">Total benefits</td>
                        <td className="py-2 px-3 text-right text-gray-700 font-medium">{INR.format(Math.round(benefitsSum))}</td>
                        <td className="py-2 px-3 text-right pr-4 text-gray-700 font-medium">{INR.format(Math.round(benefitsSum * 12))}</td>
                        <td />
                      </tr>
                    </>
                  )}

                  {/* ── DEDUCTIONS — loan / notice pay / other ── */}
                  {deductionRows.length > 0 && (
                    <>
                      <tr className="border-b border-gray-100 bg-gray-50/40">
                        <td colSpan={5} className="py-2 px-3 font-semibold text-gray-800">
                          Deductions
                          <span className="ml-2 text-[10px] font-normal text-gray-500">recoveries from payslip</span>
                        </td>
                      </tr>
                      {deductionRows.map(renderRow)}
                      <tr className="border-b border-gray-50 bg-gray-50/20">
                        <td colSpan={2} className="py-2 px-3 text-xs text-gray-500 italic">Total deductions</td>
                        <td className="py-2 px-3 text-right text-rose-700 font-medium">−{INR.format(Math.round(deductionsSum))}</td>
                        <td className="py-2 px-3 text-right pr-4 text-rose-700 font-medium">−{INR.format(Math.round(deductionsSum * 12))}</td>
                        <td />
                      </tr>
                    </>
                  )}

                  <tr className="bg-[#dcfce7]/70 font-semibold">
                    <td className="py-3 px-3 text-gray-900">Cost to Company</td>
                    <td />
                    <td className="py-3 px-3 text-right text-gray-900">₹{INR.format(Math.round(totalMonthly))}</td>
                    <td className="py-3 px-3 text-right pr-4 text-gray-900">₹{INR.format(Math.round(totalMonthly * 12))}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between mt-3">
              {(() => {
                if (availableComponents.length > 0) {
                  return (
                    <button type="button" onClick={openPicker}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#166534] hover:underline">
                      <Plus size={12} /> Add salary component
                    </button>
                  );
                }
                const noComponentsAtAll = catalog.filter((c) => c.type !== "StatutoryContribution").length === 0;
                return (
                  <Link
                    href="/payroll/setup/salary-components"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#166534] hover:underline"
                    title={noComponentsAtAll ? "No components exist. Create one first." : "All components already added"}
                  >
                    <Plus size={12} />
                    {noComponentsAtAll ? "Create salary components first →" : "All components added · manage catalog →"}
                  </Link>
                );
              })()}
              {annualCTC > 0 && totalMonthly > 0 && Math.abs(totalMonthly - monthlyCTC) > 1 && (
                <span className="text-xs text-amber-600">
                  Components total ≠ CTC. Fixed Allowance will auto-balance on save.
                </span>
              )}
            </div>
          </div>

          {err && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{err}</p>}

          <div className="flex items-center gap-2 pt-2">
            <button type="submit" disabled={saveMut.isPending} className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-md text-xs font-medium shadow-sm">
              <Save size={13} /> {saveMut.isPending ? "Saving..." : "Save"}
            </button>
            <Link href="/payroll/setup/salary-templates" className="px-3 py-1.5 border border-[var(--border)] bg-white hover:bg-gray-50 text-gray-700 rounded-md text-xs font-medium">
              Cancel
            </Link>
          </div>
        </div>
      </div>

      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-lg shadow-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h3 className="text-[13px] font-semibold text-gray-900">Add Salary Component</h3>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={12} />
              </button>
            </div>
            <div className="p-3 border-b border-gray-100">
              <div className="flex items-center gap-2 px-3 py-2 border border-[var(--border)] rounded-md">
                <Search size={14} className="text-gray-400" />
                <input
                  autoFocus
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder="Search by name or code..."
                  className="flex-1 text-xs outline-none"
                />
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {filteredPicker.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-gray-500">No components found</p>
              ) : (
                filteredPicker.map((c) => {
                  const alreadyAdded = rows.some((r) => r.componentId === c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={alreadyAdded}
                      onClick={() => pickComponent(c)}
                      className={
                        "w-full text-left px-4 py-2.5 border-b border-gray-50 last:border-b-0 flex items-center justify-between " +
                        (alreadyAdded
                          ? "bg-gray-50 cursor-not-allowed opacity-60"
                          : "hover:bg-gray-50")
                      }
                    >
                      <div>
                        <p className="text-[13px] font-semibold text-gray-900 flex items-center gap-2">
                          {c.name}
                          <span className={
                            "px-1.5 py-0.5 text-[11px] uppercase tracking-wide font-medium rounded " +
                            (c.type === "Earning"        ? "bg-green-50 text-green-700" :
                             c.type === "Reimbursement"  ? "bg-emerald-50 text-emerald-700" :
                             c.type === "Benefit"        ? "bg-violet-50 text-violet-700" :
                             c.type === "Deduction"      ? "bg-rose-50 text-rose-700" :
                                                           "bg-gray-100 text-gray-600")
                          }>
                            {c.type}
                          </span>
                        </p>
                        <p className="text-[11px] text-gray-500">{c.code} · {c.category}</p>
                      </div>
                      {alreadyAdded && (
                        <span className="text-[11px] uppercase tracking-wide font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                          Added
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

function calcMonthly(r: StructureComponentDraft, monthlyCTC: number, basicMonthly: number): number {
  const v = r.amountValue;
  switch (r.amountType) {
    case "Fixed": return v;
    case "PercentOfCTC": return (monthlyCTC * v) / 100;
    case "PercentOfBasic": return (basicMonthly * v) / 100;
    case "PercentOfGross": return (monthlyCTC * v) / 100;
    default: return 0;
  }
}
