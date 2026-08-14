"use client";

/**
 * EstimationForm — full-page edit form for a Material Estimation.
 *
 * Mirrors the Work Order edit page (WorkOrderForm) look:
 *   Sticky header:      "Edit Material Estimation · <boqNo>"        [Save Changes]
 *   BASIC INFORMATION   Project · Scope item · Scope Qty (read-only) · Phase · Status
 *   MATERIAL COMPOSITION table of material lines + Add Material + TOTAL VALUE
 *
 * The BOQ / activity anchor is locked in edit mode (changing it
 * conceptually creates a new estimation — same rule the drawer and the
 * detail page enforce), so only Phase, Status and the material lines are
 * editable. Save hits PUT /api/estimations/:id via useUpdateEstimation,
 * the same path the detail page's inline edit uses.
 */

import { toErrorMessage } from "@/lib/api/errors";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Briefcase,
  FileText,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { PageContainer } from "@/components/PageShell";
import { SelectInput } from "@/components/FormDrawer";
import {
  GroupedMaterialSelect,
  type GroupedMaterialSelectItem,
} from "@/components/GroupedMaterialSelect";
import { useItemGroups } from "@/hooks/use-masters";
import { useUpdateEstimation } from "@/hooks/use-projects";
import { useQueryClient } from "@tanstack/react-query";

const PHASES = [
  "Foundation",
  "Sub-structure",
  "Superstructure",
  "Finishing",
  "MEP",
  "External",
];
const STATUSES = ["Draft", "Active", "Approved", "Closed"];

interface MaterialLine {
  itemId: string;
  itemName: string;
  uomCode: string;
  qtyPerUnit: string;
  wasteFactor: string;
  standardRate: string;
}

interface EstimationMaterial {
  itemId?: string | null;
  itemName?: string | null;
  uomCode?: string | null;
  qtyPerUnit?: number | string | null;
  wastePercent?: number | string | null;
  standardRate?: number | string | null;
}

export interface EstimationEditData {
  id?: string;
  boqNo?: string | null;
  boqDescription?: string | null;
  boqQuantity?: number | string | null;
  boqUnit?: string | null;
  projectName?: string | null;
  scopeType?: string | null;
  scopeId?: string | null;
  phase?: string | null;
  status?: string | null;
  materials?: EstimationMaterial[];
}

type EstimationItemNode = GroupedMaterialSelectItem & {
  standardRate?: number | string | null;
};

const newLine = (): MaterialLine => ({
  itemId: "",
  itemName: "",
  uomCode: "",
  qtyPerUnit: "",
  wasteFactor: "0",
  standardRate: "",
});

interface Props {
  editData: EstimationEditData;
}

export function EstimationForm({ editData }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const updateMutation = useUpdateEstimation();

  const { data: itemGroupsData } = useItemGroups();
  const itemGroups = itemGroupsData?.data ?? [];

  const isFreeScope = editData.scopeType === "ACTIVITY";
  const scopeQuantity = Number(editData.boqQuantity) || 0;
  const scopeUnit = editData.boqUnit ?? "";

  const [phase, setPhase] = useState(editData.phase ?? PHASES[0]);
  const [status, setStatus] = useState(editData.status ?? STATUSES[0]);
  const [lines, setLines] = useState<MaterialLine[]>([newLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Seed the form from the row whenever it changes (e.g. arrives after
  // the initial fetch on the edit page).
  useEffect(() => {
    setPhase(editData.phase ?? PHASES[0]);
    setStatus(editData.status ?? STATUSES[0]);
    const seeded = (Array.isArray(editData.materials) ? editData.materials : []).map(
      (m) => ({
        itemId: m.itemId ?? "",
        itemName: m.itemName ?? "",
        uomCode: m.uomCode ?? "",
        qtyPerUnit: String(m.qtyPerUnit ?? ""),
        wasteFactor: String(m.wastePercent ?? "0"),
        standardRate: String(m.standardRate ?? ""),
      })
    );
    setLines(seeded.length ? seeded : [newLine()]);
    setError("");
  }, [editData]);

  const addLine = () => setLines((prev) => [...prev, newLine()]);
  const removeLine = (idx: number) =>
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  const updateLine = (idx: number, field: keyof MaterialLine, value: string) => {
    setLines((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const next = { ...row, [field]: value };
        if (field === "itemId" && !value) {
          next.itemName = "";
          next.uomCode = "";
          next.standardRate = "";
        }
        return next;
      })
    );
  };

  const totalCost = useMemo(
    () =>
      lines.reduce((sum, l) => {
        const qtyPerUnit = parseFloat(l.qtyPerUnit) || 0;
        const waste = parseFloat(l.wasteFactor) || 0;
        const rate = parseFloat(l.standardRate) || 0;
        const total = scopeQuantity * qtyPerUnit * (1 + waste / 100);
        return sum + total * rate;
      }, 0),
    [lines, scopeQuantity]
  );

  const handleSave = async () => {
    setError("");
    const validLines = lines.filter((l) => l.itemId && l.qtyPerUnit);
    if (validLines.length === 0) {
      setError("Add at least one material with a material + qty/unit.");
      return;
    }
    setSaving(true);
    try {
      const materials = validLines.map((l) => {
        const qtyPerUnit = parseFloat(l.qtyPerUnit) || 0;
        const wastePercent = parseFloat(l.wasteFactor) || 0;
        const rate = parseFloat(l.standardRate) || 0;
        const requiredQty = qtyPerUnit * scopeQuantity;
        const totalQty = requiredQty * (1 + wastePercent / 100);
        return {
          itemId: l.itemId,
          itemName: l.itemName,
          uomCode: l.uomCode,
          qtyPerUnit,
          wastePercent,
          requiredQty,
          totalQty,
          standardRate: rate,
          estimatedCost: totalQty * rate,
        };
      });
      await updateMutation.mutateAsync({
        id: editData.id!,
        phase,
        status,
        materials,
      });
      qc.invalidateQueries({ queryKey: ["estimation", editData.id] });
      qc.invalidateQueries({ queryKey: ["estimations"] });
      router.push("/projects/estimation");
      router.refresh();
    } catch (e: unknown) {
      setError(toErrorMessage(e, "Failed to save estimation"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Header strip — matches the Work Order edit page. */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/projects/estimation"
            className="p-1.5 rounded-lg hover:bg-accent-50 hover:text-accent-700 text-slate-500 transition-colors"
            title="Back to Material Estimation"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="hidden sm:block w-1 h-6 rounded-full bg-gradient-to-b from-accent-500 to-accent-600"
            />
            <div>
              <h1 className="text-lg font-semibold text-slate-900 tracking-tight">
                Edit Material Estimation
                {editData.boqNo ? ` · ${editData.boqNo}` : ""}
              </h1>
              <p className="text-xs text-slate-500">
                Update materials, waste %, and rates per unit of the scope item.
              </p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-b from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 disabled:opacity-50 rounded-lg shadow-brand active:translate-y-[1px] transition-all"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Save className="w-4 h-4" /> Save Changes
            </>
          )}
        </button>
      </div>

      <PageContainer>
        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5 text-sm text-rose-700 flex items-start gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError("")} className="text-rose-400 hover:text-rose-600">
              ×
            </button>
          </div>
        )}

        {/* ── BASIC INFORMATION ── */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-soft px-6 py-5 mb-5">
          <h2 className="text-xs font-bold text-accent-700 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Briefcase className="w-4 h-4" /> BASIC INFORMATION
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="PROJECT">
              <div className="flex items-center gap-2 w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700">
                <span className="truncate font-medium">
                  {editData.projectName ?? "—"}
                </span>
                {isFreeScope && (
                  <span className="shrink-0 whitespace-nowrap rounded bg-accent-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent-700 border border-accent-200">
                    Free-Scope
                  </span>
                )}
              </div>
              <p className="mt-1 text-[10px] text-gray-400">
                Project is locked — change the scope item on a new estimation.
              </p>
            </Field>
            <Field label={isFreeScope ? "ACTIVITY" : "BOQ ITEM"}>
              <div className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 truncate">
                <span className="font-semibold">{editData.boqNo ?? "—"}</span>
                {editData.boqDescription ? ` · ${editData.boqDescription}` : ""}
              </div>
            </Field>
            <Field label={isFreeScope ? "PLANNED QTY" : "BOQ QTY"}>
              <div className="relative">
                <input
                  type="text"
                  value={scopeQuantity > 0 ? String(scopeQuantity) : ""}
                  readOnly
                  placeholder="—"
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 font-medium"
                />
                {scopeUnit && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] uppercase font-semibold text-gray-400">
                    {scopeUnit}
                  </span>
                )}
              </div>
            </Field>
            <Field label="CONSTRUCTION PHASE" required>
              <SelectInput
                value={phase}
                onChange={setPhase}
                options={PHASES.map((p) => ({ value: p, label: p }))}
              />
            </Field>
            <Field label="STATUS" required>
              <SelectInput
                value={status}
                onChange={setStatus}
                options={STATUSES.map((s) => ({ value: s, label: s }))}
              />
            </Field>
          </div>
        </section>

        {/* ── MATERIAL COMPOSITION ── */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-soft px-6 py-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold text-accent-700 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4" /> MATERIAL COMPOSITION
            </h2>
            <button
              type="button"
              onClick={addLine}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-700 hover:text-accent-800 bg-accent-50 hover:bg-accent-100 border border-accent-200 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Material
            </button>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead className="bg-gradient-to-b from-slate-50 to-slate-100/70 border-b border-slate-200">
                <tr className="text-[11px] uppercase font-bold text-slate-600 tracking-wider">
                  <th className="px-3 py-3 text-left w-[40px]">#</th>
                  <th className="px-3 py-3 text-left">Material</th>
                  <th className="px-3 py-3 text-left w-[90px]">UOM</th>
                  <th className="px-3 py-3 text-right w-[110px]">Qty / Unit</th>
                  <th className="px-3 py-3 text-right w-[90px]">Waste %</th>
                  <th className="px-3 py-3 text-right w-[120px]">Std Rate (₹)</th>
                  <th className="px-3 py-3 text-right w-[120px]">Total Qty</th>
                  <th className="px-3 py-3 text-right w-[130px]">Cost (₹)</th>
                  <th className="px-3 py-3 w-[40px]"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => {
                  const qtyPerUnit = parseFloat(line.qtyPerUnit) || 0;
                  const waste = parseFloat(line.wasteFactor) || 0;
                  const rate = parseFloat(line.standardRate) || 0;
                  const totalQty = scopeQuantity * qtyPerUnit * (1 + waste / 100);
                  const cost = totalQty * rate;
                  return (
                    <tr
                      key={idx}
                      className="border-t border-slate-100 hover:bg-accent-50/40 transition-colors align-top"
                    >
                      <td className="px-3 py-2 text-xs font-bold text-slate-400 pt-4">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-2 min-w-[240px]">
                        <GroupedMaterialSelect
                          lazy
                          value={line.itemId}
                          selectedLabel={line.itemName}
                          onChange={(v) => updateLine(idx, "itemId", v)}
                          onSelect={(item) => {
                            if (!item) return;
                            const it = item as EstimationItemNode;
                            setLines((prev) =>
                              prev.map((row, i) =>
                                i === idx
                                  ? {
                                      ...row,
                                      itemName: it.name ?? "",
                                      uomCode: it.uomCode ?? "",
                                      standardRate:
                                        it.standardRate?.toString() ?? "",
                                    }
                                  : row
                              )
                            );
                          }}
                          items={[]}
                          groups={itemGroups.map((g) => ({
                            id: g.id,
                            name: g.name,
                            status: g.status,
                            itemCount: g.itemCount,
                          }))}
                          placeholder="Select material…"
                          size="md"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={line.uomCode}
                          onChange={(e) => updateLine(idx, "uomCode", e.target.value)}
                          className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded text-center uppercase focus:outline-none focus:ring-1 focus:ring-accent-300 focus:border-accent-400"
                          placeholder="—"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.qtyPerUnit}
                          onChange={(e) => updateLine(idx, "qtyPerUnit", e.target.value)}
                          className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded text-right focus:outline-none focus:ring-1 focus:ring-accent-300 focus:border-accent-400"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          value={line.wasteFactor}
                          onChange={(e) => updateLine(idx, "wasteFactor", e.target.value)}
                          className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded text-right focus:outline-none focus:ring-1 focus:ring-accent-300 focus:border-accent-400"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.standardRate}
                          onChange={(e) => updateLine(idx, "standardRate", e.target.value)}
                          className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded text-right focus:outline-none focus:ring-1 focus:ring-accent-300 focus:border-accent-400"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-3 py-2 text-right text-xs font-medium text-slate-700 tabular-nums pt-4">
                        {totalQty > 0
                          ? totalQty.toLocaleString("en-IN", {
                              maximumFractionDigits: 2,
                            })
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-semibold text-slate-900 tabular-nums pt-4">
                        {cost > 0
                          ? `₹${cost.toLocaleString("en-IN", {
                              maximumFractionDigits: 0,
                            })}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right pt-3">
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          disabled={lines.length <= 1}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Remove line"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-accent-50 border-t border-slate-200">
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-3 text-right text-xs font-bold text-slate-700 uppercase tracking-wider"
                  >
                    Total Value
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-bold text-accent-700 tabular-nums">
                    ₹{totalCost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Total Qty = {isFreeScope ? "Planned" : "BOQ"} Qty × Qty/Unit ×
            (1 + Waste %). Cost = Total Qty × Std Rate.
          </p>
        </section>
      </PageContainer>
    </>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
