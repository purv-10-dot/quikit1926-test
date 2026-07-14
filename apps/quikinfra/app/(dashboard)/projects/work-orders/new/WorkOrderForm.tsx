"use client";

/**
 * WorkOrderForm — shared full-page form for both Create and Edit flows.
 *
 * Used from:
 *   - /projects/work-orders/new            (create — editData omitted)
 *   - /projects/work-orders/[id]/edit      (edit  — editData = the row)
 *
 * Layout:
 *   Header strip:      "New / Edit Work Order — Define contractor scope…"   [Save]
 *   BASIC INFORMATION  Project · WO Type · Contractor · Work Type · Dates
 *   BOQ SCOPE          empty state → [Add BOQ Item] → table grows below
 *
 * Save branches:
 *   - create → POST /api/projects/work-orders
 *   - edit   → PUT  /api/projects/work-orders/:id
 *
 * In edit mode the BOQ scope table is pre-filled and the project
 * selector is locked (projectId is stable once items are on the WO).
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
import { useProjects, useContractors, useUOMs, useWorkCategories } from "@/hooks/use-masters";
import { buildLookupOptions } from "@/lib/masters/lookup";
import {
  isLabourWorkType,
  labourLineFromWoItem,
  labourLineToBoqItem,
  type LabourScopeLine,
} from "@/lib/projects/labour-scope";
import { BOQActivityPickerModal } from "./BOQActivityPickerModal";
import { LabourScopeTable } from "./LabourScopeTable";

interface ScopeLine {
  boqItemId: string;
  boqNo: string;
  description: string;
  uomCode: string;
  quantity: string;
  rate: string;
}

interface WoBoqItem {
  boqItemId?: string; boqNo?: string; description?: string;
  uomCode?: string; quantity?: number | string; rate?: number | string;
  // Labour-only line fields (per-trade counts arrive as extra numeric keys)
  lineType?: string; lineDate?: string; activityName?: string;
  workCategoryId?: string;
}
interface WorkOrderEditData {
  id?: string; woNumber?: string; projectId?: string; type?: string;
  contractorId?: string; contractorName?: string; workType?: string; title?: string;
  plannedStart?: string; plannedEnd?: string; boqItems?: WoBoqItem[];
}
/** Row handed back by BOQActivityPickerModal's onPick. */
interface WoBoqPickRow {
  id?: string; boq_no?: string; display_name?: string; unit?: string | null;
  balanceQty?: number | string; scopeQty?: number | string;
}

interface Props {
  /** When present, switches to edit mode and pre-fills every field. */
  editData?: WorkOrderEditData | null;
  /** When true, hides the sticky page header strip (back button + Save)
   *  so the form can render cleanly inside a side drawer that supplies
   *  its own header/footer chrome. After a successful save, `onSaved`
   *  fires instead of the default `router.push` so the drawer host
   *  can close itself and refresh the list. */
  embedded?: boolean;
  /** Called after a successful create / update when `embedded` is true. */
  onSaved?: () => void;
}

export function WorkOrderForm({ editData, embedded = false, onSaved }: Props) {
  const router = useRouter();
  const isEdit = !!editData?.id;

  const { data: projectsResult } = useProjects();
  const { data: contractorsResult } = useContractors();
  const { data: uomsResult } = useUOMs();
  const { data: workCategoriesResult } = useWorkCategories();

  const projects = projectsResult?.data ?? [];
  const contractors = contractorsResult?.data ?? [];
  const uoms = (uomsResult?.data ?? []) as Array<{ code?: string; status?: string }>;
  const workCategories = workCategoriesResult?.data ?? [];

  // Basic Information state
  const [projectId, setProjectId] = useState("");
  const [woType, setWoType] = useState("Work Order");
  const [contractorId, setContractorId] = useState("");
  const [workType, setWorkType] = useState("Without Material (Aakar supplies)");
  const [workName, setWorkName] = useState("");
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedEnd, setPlannedEnd] = useState("");

  // BOQ Scope state
  const [scope, setScope] = useState<ScopeLine[]>([]);
  const [boqModalOpen, setBoqModalOpen] = useState(false);

  // Labour-only scope state (shown when work type = Labour Only)
  const [labourScope, setLabourScope] = useState<LabourScopeLine[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // When a Labour-Only save is attempted with empty required cells, flip this
  // on so the LabourScopeTable highlights each missing field inline.
  const [showLabourErrors, setShowLabourErrors] = useState(false);

  const isLabourOnly = isLabourWorkType(workType);
  const hasScopeLines = isLabourOnly ? labourScope.length > 0 : scope.length > 0;

  // Pre-fill from editData when the component mounts or the row changes
  useEffect(() => {
    if (!editData) return;
    setProjectId(editData.projectId ?? "");
    setWoType(editData.type ?? "Work Order");
    setContractorId(editData.contractorId ?? "");
    setWorkType(editData.workType ?? "Without Material (Aakar supplies)");
    setWorkName(editData.title ?? "");
    setPlannedStart(editData.plannedStart ? String(editData.plannedStart).slice(0, 10) : "");
    setPlannedEnd(editData.plannedEnd ? String(editData.plannedEnd).slice(0, 10) : "");
    const rawScope: WoBoqItem[] = Array.isArray(editData.boqItems) ? editData.boqItems : [];
    if (isLabourWorkType(editData.workType)) {
      setLabourScope(rawScope.map((s) => labourLineFromWoItem(s)));
      setScope([]);
    } else {
      setScope(
        rawScope.map((s) => ({
          boqItemId: s.boqItemId ?? "",
          boqNo: s.boqNo ?? "",
          description: s.description ?? "",
          uomCode: s.uomCode ?? "",
          quantity: s.quantity != null ? String(s.quantity) : "",
          rate: s.rate != null ? String(s.rate) : "",
        }))
      );
      setLabourScope([]);
    }
  }, [editData]);

  const totalValue = useMemo(
    () =>
      scope.reduce((sum, line) => {
        const qty = parseFloat(line.quantity) || 0;
        const rate = parseFloat(line.rate) || 0;
        return sum + qty * rate;
      }, 0),
    [scope]
  );

  // Keyed by BOTH the BOQ item UUID and the BOQ number. Saved WO lines
  // persist the boqNo in place of the UUID, so on reload (edit mode) the
  // scope rows only carry the boqNo — matching on either value keeps the
  // duplicate guard working across create and edit.
  const alreadyAddedIds = useMemo(
    () =>
      new Set(scope.flatMap((s) => [s.boqItemId, s.boqNo].filter(Boolean))),
    [scope]
  );

  const addBoqItem = (row: WoBoqPickRow) => {
    const itemId = row.id ?? "";
    const boqNo = row.boq_no ?? "";
    // Defensive guard: the picker already blocks duplicates, but never
    // append a row whose item id / boqNo is already on the scope.
    if (alreadyAddedIds.has(itemId) || (boqNo && alreadyAddedIds.has(boqNo))) {
      return;
    }
    setScope((prev) => [
      ...prev,
      {
        boqItemId: itemId,
        boqNo,
        description: row.display_name ?? "",
        uomCode: row.unit ?? "",
        quantity: String(row.balanceQty ?? row.scopeQty ?? ""),
        rate: "",
      },
    ]);
  };

  const updateScopeLine = (idx: number, field: keyof ScopeLine, value: string) => {
    setScope((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row))
    );
  };

  const removeScopeLine = (idx: number) => {
    setScope((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setError("");
    setShowLabourErrors(false);
    if (!projectId) return setError("Pick a project");
    if (!contractorId) return setError("Select a contractor");
    if (!plannedStart) return setError("Pick a planned start date");
    if (!plannedEnd) return setError("Pick a planned end date");
    if (plannedEnd <= plannedStart) {
      return setError("Planned end must be after planned start");
    }
    if (isLabourOnly) {
      if (labourScope.length === 0) {
        setShowLabourErrors(true);
        return setError("Add at least one labour activity");
      }
      const invalidLabour = labourScope.find(
        (s) =>
          !s.lineDate ||
          !s.activityName.trim() ||
          !s.workCategoryId ||
          s.labourTypes.length === 0 ||
          s.labourTypes.some((lt) => !lt.type || !(parseFloat(lt.count) > 0))
      );
      if (invalidLabour) {
        setShowLabourErrors(true);
        return setError(
          "For every row fill date, activity name, group, and a count for each labour type"
        );
      }
    } else {
      if (scope.length === 0) return setError("Add at least one BOQ item");
      const invalid = scope.find((s) => !s.quantity || !s.rate);
      if (invalid) {
        return setError(`Fill qty + rate for all BOQ lines (missing on ${invalid.boqNo})`);
      }
    }

    setSaving(true);
    try {
      const contractor = contractors.find((c) => c.id === contractorId);
      const boqItems = isLabourOnly
        ? labourScope.map((s) => labourLineToBoqItem(s))
        : scope.map((s) => {
            const qty = parseFloat(s.quantity) || 0;
            const rate = parseFloat(s.rate) || 0;
            return {
              boqItemId: s.boqItemId,
              boqNo: s.boqNo,
              description: s.description,
              uomCode: s.uomCode,
              quantity: qty,
              rate,
              amount: qty * rate,
            };
          });

      const project = projects.find((p) => p.id === projectId);
      const fallbackTitle = `${woType} for ${project?.name ?? ""}`.trim();
      const payload = {
        projectId,
        contractorId: contractorId || null,
        contractorName: contractor?.name ?? editData?.contractorName ?? "New Contractor",
        type: woType,
        workType,
        title: workName.trim() || fallbackTitle,
        plannedStart: plannedStart || null,
        plannedEnd: plannedEnd || null,
        boqItems,
        // Edit preserves status; create stamps "draft".
        ...(isEdit ? {} : { status: "draft" }),
      };

      const url = isEdit
        ? `/api/projects/work-orders/${editData.id}`
        : `/api/projects/work-orders`;
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `wo-${isEdit ? editData.id : "new"}-${Date.now()}`,
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);

      if (embedded) {
        // Drawer host owns navigation/refresh — let it react to the save.
        onSaved?.();
      } else {
        router.push("/projects/work-orders");
        router.refresh();
      }
    } catch (e: unknown) {
      setError(toErrorMessage(e, "Failed to save work order"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Header strip — hidden in embedded (drawer) mode because the
          drawer chrome supplies its own header and Save button. */}
      {!embedded && (
      <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/projects/work-orders"
            className="p-1.5 rounded-lg hover:bg-orange-50 hover:text-orange-700 text-slate-500 transition-colors"
            title="Back to Work Orders"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="hidden sm:block w-1 h-6 rounded-full bg-gradient-to-b from-orange-500 to-orange-600" />
            <div>
            <h1 className="text-lg font-semibold text-slate-900 tracking-tight">
              {isEdit ? `Edit Work Order · ${editData?.woNumber ?? ""}` : "New Work Order"}
            </h1>
            <p className="text-xs text-slate-500">
              {isEdit
                ? "Update scope, rates, contractor, and schedule."
                : "Define contractor scope, rates, and terms."}
            </p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:opacity-50 rounded-lg shadow-brand active:translate-y-[1px] transition-all"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Save className="w-4 h-4" /> {isEdit ? "Save Changes" : "Save Draft"}
            </>
          )}
        </button>
      </div>
      )}

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
          <h2 className="text-xs font-bold text-orange-700 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Briefcase className="w-4 h-4" /> BASIC INFORMATION
          </h2>
          <div className="mb-4">
            <Field label="WORK NAME">
              <input
                type="text"
                value={workName}
                onChange={(e) => setWorkName(e.target.value)}
                placeholder="e.g. Tower-2 Plumbing Rough-in (auto-derived from WO type + project if left blank)"
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="PROJECT" required>
              <SelectInput
                value={projectId}
                onChange={setProjectId}
                disabled={isEdit && hasScopeLines}
                placeholder="Select project…"
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
              />
              {isEdit && hasScopeLines && (
                <p className="mt-1 text-[10px] text-gray-400">
                  Project is locked because scope lines are attached.
                </p>
              )}
            </Field>
            <Field label="WO TYPE">
              <SelectInput
                value={woType}
                onChange={setWoType}
                options={[
                  { value: "Work Order", label: "Work Order" },
                  { value: "Service Order", label: "Service Order" },
                  { value: "Supply Order", label: "Supply Order" },
                ]}
              />
            </Field>
            <Field label="CONTRACTOR" required>
              {(() => {
                const { options, notice } = buildLookupOptions({
                  rows: contractors,
                  assigned: contractorId,
                  by: "id",
                  entityLabel: "contractor",
                });
                return (
                  <>
                    <SelectInput
                      value={contractorId}
                      onChange={setContractorId}
                      placeholder="Select Contractor…"
                      options={options}
                    />
                    {notice && (
                      <p className="mt-1 text-xs text-amber-600">⚠ {notice}</p>
                    )}
                  </>
                );
              })()}
            </Field>
            <Field label="WORK TYPE">
              <SelectInput
                value={workType}
                onChange={setWorkType}
                options={[
                  { value: "Without Material (Aakar supplies)", label: "Without Material (Aakar supplies)" },
                  { value: "With Material (contractor supplies)", label: "With Material (contractor supplies)" },
                  { value: "Labour Only", label: "Labour Only" },
                ]}
              />
            </Field>
            <Field label="PLANNED START" required>
              <input
                type="date"
                value={plannedStart}
                onChange={(e) => {
                  const next = e.target.value;
                  setPlannedStart(next);
                  // Auto-bump end date so it stays strictly after start
                  if (next && plannedEnd && plannedEnd <= next) {
                    setPlannedEnd(addDays(next, 1));
                  }
                }}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
              />
            </Field>
            <Field label="PLANNED END" required>
              <input
                type="date"
                value={plannedEnd}
                min={plannedStart ? addDays(plannedStart, 1) : undefined}
                onChange={(e) => setPlannedEnd(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
              />
            </Field>
          </div>
        </section>

        {/* ── SCOPE: Labour table OR BOQ items ── */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-soft px-6 py-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold text-orange-700 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4" />{" "}
              {isLabourOnly ? "WORK ORDER DETAILS" : "BOQ SCOPE"}
            </h2>
            {!isLabourOnly && (
              <button
                type="button"
                onClick={() => {
                  if (!projectId) {
                    setError("Pick a project first before adding BOQ items");
                    return;
                  }
                  setBoqModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-700 hover:text-orange-800 bg-orange-50 hover:bg-orange-100 border border-orange-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add BOQ Item
              </button>
            )}
          </div>

          {isLabourOnly ? (
            <LabourScopeTable
              lines={labourScope}
              onChange={setLabourScope}
              workCategories={workCategories}
              showErrors={showLabourErrors}
            />
          ) : scope.length === 0 ? (
            <button
              type="button"
              onClick={() => {
                if (!projectId) {
                  setError("Pick a project first before adding BOQ items");
                  return;
                }
                setBoqModalOpen(true);
              }}
              className="w-full border-2 border-dashed border-orange-200 bg-orange-50/30 hover:bg-orange-50/60 hover:border-orange-300 rounded-xl p-10 text-center transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-300"
            >
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-orange-50 text-orange-500 mb-3 ring-4 ring-orange-50/60">
                <FileText className="w-6 h-6" />
              </div>
              <div className="text-sm font-semibold text-slate-800">No BOQ items added yet</div>
              <p className="text-xs text-slate-500 mt-1">
                Add items to define the scope and value of this work order.
              </p>
            </button>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gradient-to-b from-slate-50 to-slate-100/70 border-b border-slate-200">
                  <tr className="text-[11px] uppercase font-bold text-slate-600 tracking-wider">
                    <th className="px-3 py-3 text-left w-[100px]">Item Code</th>
                    <th className="px-3 py-3 text-left">Description</th>
                    <th className="px-3 py-3 text-left w-[90px]">UOM</th>
                    <th className="px-3 py-3 text-right w-[130px]">Quantity</th>
                    <th className="px-3 py-3 text-right w-[130px]">Rate (₹)</th>
                    <th className="px-3 py-3 text-right w-[140px]">Amount (₹)</th>
                    <th className="px-3 py-3 w-[40px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {scope.map((line, idx) => {
                    const qty = parseFloat(line.quantity) || 0;
                    const rate = parseFloat(line.rate) || 0;
                    const amount = qty * rate;
                    return (
                      <tr key={`${line.boqItemId}-${idx}`} className="border-t border-slate-100 hover:bg-orange-50/40 transition-colors">
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={line.boqNo}
                            onChange={(e) => updateScopeLine(idx, "boqNo", e.target.value)}
                            className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={line.description}
                            onChange={(e) =>
                              updateScopeLine(idx, "description", e.target.value)
                            }
                            className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <SelectInput
                            value={line.uomCode}
                            onChange={(v) => updateScopeLine(idx, "uomCode", v)}
                            placeholder="—"
                            options={(() => {
                              const opts = uoms.filter((u) => u.status === "active").map((u) => ({ value: u.code ?? "", label: u.code ?? "" }));
                              if (
                                line.uomCode &&
                                !uoms.find((u) => u.code === line.uomCode)
                              ) {
                                opts.push({ value: line.uomCode, label: line.uomCode });
                              }
                              return opts;
                            })()}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.quantity}
                            onChange={(e) =>
                              updateScopeLine(idx, "quantity", e.target.value)
                            }
                            className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded text-right focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.rate}
                            onChange={(e) => updateScopeLine(idx, "rate", e.target.value)}
                            className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded text-right focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400"
                            placeholder="0"
                          />
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-semibold text-slate-900 tabular-nums">
                          ₹{amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeScopeLine(idx)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Remove line"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-orange-50/50 border-t border-slate-200">
                  <tr>
                    <td colSpan={5} className="px-3 py-3 text-right text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Total Value
                    </td>
                    <td className="px-3 py-3 text-right text-sm font-bold text-orange-700 tabular-nums">
                      ₹{totalValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      </PageContainer>

      {/* BOQ picker modal — only for non-labour work types */}
      {!isLabourOnly && (
        <BOQActivityPickerModal
          open={boqModalOpen}
          onClose={() => setBoqModalOpen(false)}
          projectId={projectId}
          alreadyAddedIds={alreadyAddedIds}
          onAdd={addBoqItem}
        />
      )}

      {/* Embedded-mode footer — shows the Save button at the bottom of
          the form when hosted inside a drawer (the top header strip is
          hidden in that mode, so without this footer there'd be no way
          to save). Mirrors the QuickCreateDrawer footer convention. */}
      {embedded && (
        <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-3 shrink-0 bg-gray-50">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:opacity-50 rounded-lg shadow-brand active:translate-y-[1px] transition-all"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Save className="w-4 h-4" /> {isEdit ? "Save Changes" : "Save Draft"}
              </>
            )}
          </button>
        </div>
      )}
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

// Adds N days to a YYYY-MM-DD string and returns the same format.
// Used to keep planned-end strictly after planned-start.
function addDays(yyyyMmDd: string, days: number) {
  const d = new Date(yyyyMmDd + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
