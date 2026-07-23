"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { Plus, Trash2, GripVertical, Target, Check, AlertTriangle, Save } from "lucide-react";
import { clsx } from "clsx";

interface Designation { id: string; title: string }
interface Department { id: string; name: string }

export interface KpiDraft {
  id?: string;
  title: string;
  description: string;
  measurementMethod: string;
  target: string;
  unit: string;
  weight: number;
}

export interface KraDraft {
  id?: string;
  title: string;
  description: string;
  weight: number;
  kpis: KpiDraft[];
}

export interface ScorecardDraft {
  name: string;
  description: string;
  designationId: string;
  departmentId: string;
  tags: string[];
  effectiveFrom: string;
  isActive: boolean;
  kras: KraDraft[];
}

const emptyKpi = (): KpiDraft => ({
  title: "", description: "", measurementMethod: "", target: "", unit: "", weight: 100,
});

const emptyKra = (): KraDraft => ({
  title: "", description: "", weight: 100, kpis: [emptyKpi()],
});

export const emptyDraft = (): ScorecardDraft => ({
  name: "",
  description: "",
  designationId: "",
  departmentId: "",
  tags: [],
  effectiveFrom: new Date().toISOString().slice(0, 10),
  isActive: true,
  kras: [emptyKra()],
});

const round2 = (n: number) => Math.round(n * 100) / 100;
const sumWeight = (items: { weight: number }[]) => round2(items.reduce((s, i) => s + (i.weight || 0), 0));

export function ScorecardEditor({
  scorecardId,
  initialDraft,
}: {
  scorecardId?: string;
  initialDraft?: ScorecardDraft;
}) {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const isEdit = !!scorecardId;

  const [draft, setDraft] = useState<ScorecardDraft>(initialDraft ?? emptyDraft());
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (initialDraft) setDraft(initialDraft);
  }, [initialDraft]);

  const { data: desigData } = useQuery({
    queryKey: ["designations-lite"],
    queryFn: () => api.get<Designation[]>("/api/v1/hrms/designations?limit=300"),
    staleTime: 5 * 60_000,
  });
  const designations = desigData?.data ?? [];

  const { data: deptData } = useQuery({
    queryKey: ["departments-lite-kra"],
    queryFn: () => api.get<Department[]>("/api/v1/hrms/departments?limit=200"),
    staleTime: 5 * 60_000,
  });
  const departments = deptData?.data ?? [];

  const kraSum = sumWeight(draft.kras);
  const kraSumValid = Math.abs(kraSum - 100) < 0.01;

  const saveMut = useMutation({
    mutationFn: () => {
      const body = {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        designationId: draft.designationId || null,
        departmentId: draft.departmentId || null,
        tags: draft.tags,
        effectiveFrom: draft.effectiveFrom,
        isActive: draft.isActive,
        kras: draft.kras.map((k, i) => ({
          title: k.title.trim(),
          description: k.description.trim() || null,
          weight: k.weight,
          sortOrder: i,
          kpis: k.kpis.map((p, j) => ({
            title: p.title.trim(),
            description: p.description.trim() || null,
            measurementMethod: p.measurementMethod.trim() || null,
            target: p.target.trim() || null,
            unit: p.unit.trim() || null,
            weight: p.weight,
            sortOrder: j,
          })),
        })),
      };
      return isEdit
        ? api.put(`/api/v1/hrms/performance/kra-templates/${scorecardId}`, body)
        : api.post<{ id: string }>("/api/v1/hrms/performance/kra-templates", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["performance", "kra-templates"] });
      toast.success(isEdit ? "Saved" : "Scorecard created");
      // Always return to the list — on create AND on edit. HR sees the new/updated
      // row alongside the rest of the scorecards.
      router.push("/performance/kra-templates");
    },
  });

  /* ─── mutation helpers ─── */
  const setKraField = (kraIdx: number, patch: Partial<KraDraft>) => {
    setDraft((d) => ({
      ...d,
      kras: d.kras.map((k, i) => (i === kraIdx ? { ...k, ...patch } : k)),
    }));
  };
  const setKpiField = (kraIdx: number, kpiIdx: number, patch: Partial<KpiDraft>) => {
    setDraft((d) => ({
      ...d,
      kras: d.kras.map((k, i) =>
        i === kraIdx
          ? { ...k, kpis: k.kpis.map((p, j) => (j === kpiIdx ? { ...p, ...patch } : p)) }
          : k,
      ),
    }));
  };
  const addKra = () => setDraft((d) => ({ ...d, kras: [...d.kras, emptyKra()] }));
  const removeKra = (idx: number) => setDraft((d) => ({ ...d, kras: d.kras.filter((_, i) => i !== idx) }));
  const addKpi = (kraIdx: number) => {
    setDraft((d) => ({
      ...d,
      kras: d.kras.map((k, i) => (i === kraIdx ? { ...k, kpis: [...k.kpis, emptyKpi()] } : k)),
    }));
  };
  const removeKpi = (kraIdx: number, kpiIdx: number) => {
    setDraft((d) => ({
      ...d,
      kras: d.kras.map((k, i) =>
        i === kraIdx ? { ...k, kpis: k.kpis.filter((_, j) => j !== kpiIdx) } : k,
      ),
    }));
  };
  const addTag = () => {
    const t = tagInput.trim();
    if (!t || draft.tags.includes(t)) return;
    setDraft((d) => ({ ...d, tags: [...d.tags, t] }));
    setTagInput("");
  };
  const removeTag = (t: string) => setDraft((d) => ({ ...d, tags: d.tags.filter((x) => x !== t) }));

  /* ─── derived validation ─── */
  const canSave =
    !!draft.name.trim() &&
    !!draft.effectiveFrom &&
    !!draft.departmentId &&
    draft.kras.length > 0 &&
    draft.kras.every((k) => k.title.trim() && k.kpis.length > 0 && k.kpis.every((p) => p.title.trim())) &&
    kraSumValid &&
    draft.kras.every((k) => Math.abs(sumWeight(k.kpis) - 100) < 0.01);

  return (
    <div className="w-full max-w-5xl mx-auto pb-28">
      {/* Header card */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-50 text-green-600 flex items-center justify-center shrink-0">
            <Target size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-page-title text-gray-900 leading-tight">
              {isEdit ? "Edit scorecard" : "New scorecard"}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Define KRAs with weights summing to 100. Each KRA needs KPIs whose own weights also sum to 100.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Scorecard name" required>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. Sales Manager — Q2 FY26"
              className={inputCls}
            />
          </Field>
          <Field label="Effective from" required>
            <input
              type="date"
              value={draft.effectiveFrom}
              onChange={(e) => setDraft({ ...draft, effectiveFrom: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Designation">
            <Select
              value={draft.designationId}
              onChange={(v) => setDraft({ ...draft, designationId: v })}
              searchable
              placeholder="Select designation"
              options={[
                { value: "", label: "— none —" },
                ...designations.map((d) => ({ value: d.id, label: d.title })),
              ]}
            />
          </Field>
          <Field label="Department" required>
            <Select
              value={draft.departmentId}
              onChange={(v) => setDraft({ ...draft, departmentId: v })}
              searchable
              placeholder="Select department"
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
            />
            <p className="mt-1 text-xs text-gray-500">
              Only employees from this department will be visible when assigning this scorecard.
            </p>
          </Field>
        </div>

        <Field label="Description">
          <textarea
            rows={2}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="What this scorecard is for"
            className={inputCls + " resize-none"}
          />
        </Field>

        <Field label="Tags">
          <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-md bg-gray-50 ring-1 ring-gray-200">
            {draft.tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white rounded text-[11px] font-medium text-gray-800 ring-1 ring-gray-200">
                {t}
                <button type="button" onClick={() => removeTag(t)} className="hover:text-red-600">×</button>
              </span>
            ))}
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); addTag(); }
                else if (e.key === "Backspace" && !tagInput && draft.tags.length) {
                  setDraft((d) => ({ ...d, tags: d.tags.slice(0, -1) }));
                }
              }}
              placeholder="Add tag and press Enter (e.g. Operations)"
              className="flex-1 min-w-[120px] text-xs px-2 py-1 bg-transparent focus:outline-none"
            />
          </div>
        </Field>

        <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
            className="rounded"
          />
          Active — available for new assignments
        </label>
      </div>

      {/* KRAs */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-gray-900">KRAs ({draft.kras.length})</h2>
          <WeightBadge sum={kraSum} />
        </div>
        <button
          type="button"
          onClick={addKra}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-[#166534]/10 text-[#166534] hover:bg-[#166534] hover:text-white transition"
        >
          <Plus size={13} /> Add KRA
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {draft.kras.map((kra, kraIdx) => {
          const kpiSum = sumWeight(kra.kpis);
          return (
            <div key={kraIdx} className="rounded-xl border border-gray-200 bg-white">
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-green-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-1">
                    {kraIdx + 1}
                  </div>
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_120px] gap-3">
                    <Field label="KRA title" required compact>
                      <input
                        value={kra.title}
                        onChange={(e) => setKraField(kraIdx, { title: e.target.value })}
                        placeholder="e.g. Customer Satisfaction"
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Weight %" required compact>
                      <NumberInput
                        value={kra.weight}
                        onChange={(v) => setKraField(kraIdx, { weight: v ?? 0 })}
                        min="0" max="100" step="0.01"
                        className={inputCls + " text-right"}
                      />
                    </Field>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeKra(kraIdx)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition mt-5"
                    title="Remove KRA"
                    disabled={draft.kras.length <= 1}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                <Field label="KRA description" compact>
                  <input
                    value={kra.description}
                    onChange={(e) => setKraField(kraIdx, { description: e.target.value })}
                    placeholder="Optional"
                    className={inputCls}
                  />
                </Field>

                {/* KPIs */}
                <div className="mt-4 pl-9">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                        KPIs ({kra.kpis.length})
                      </h4>
                      <WeightBadge sum={kpiSum} small />
                    </div>
                    <button
                      type="button"
                      onClick={() => addKpi(kraIdx)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-normal text-[#22c55e] hover:bg-green-50"
                    >
                      <Plus size={12} /> Add KPI
                    </button>
                  </div>

                  <div className="space-y-2">
                    {kra.kpis.map((kpi, kpiIdx) => (
                      <div key={kpiIdx} className="rounded-lg ring-1 ring-gray-100 bg-gray-50/50 p-3">
                        <div className="flex items-start gap-2">
                          <GripVertical size={12} className="text-gray-300 mt-2.5 shrink-0" />
                          <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_120px_80px] gap-2">
                            <Field label="KPI title" required compact>
                              <input
                                value={kpi.title}
                                onChange={(e) => setKpiField(kraIdx, kpiIdx, { title: e.target.value })}
                                placeholder="e.g. CSAT score ≥ 4.5 / 5"
                                className={inputCls}
                              />
                            </Field>
                            <Field label="Target" compact>
                              <input
                                value={kpi.target}
                                onChange={(e) => setKpiField(kraIdx, kpiIdx, { target: e.target.value })}
                                placeholder="e.g. ≥ 90% / ≤ 45d"
                                className={inputCls}
                              />
                            </Field>
                            <Field label="Weight %" required compact>
                              <NumberInput
                                value={kpi.weight}
                                onChange={(v) => setKpiField(kraIdx, kpiIdx, { weight: v ?? 0 })}
                                min="0" max="100" step="0.01"
                                className={inputCls + " text-right"}
                              />
                            </Field>
                            <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                              <Field label="Measurement method" compact>
                                <input
                                  value={kpi.measurementMethod}
                                  onChange={(e) => setKpiField(kraIdx, kpiIdx, { measurementMethod: e.target.value })}
                                  placeholder="e.g. CRM report, survey, system log"
                                  className={inputCls}
                                />
                              </Field>
                              <Field label="Unit" compact>
                                <input
                                  value={kpi.unit}
                                  onChange={(e) => setKpiField(kraIdx, kpiIdx, { unit: e.target.value })}
                                  placeholder="e.g. %, days, ₹"
                                  className={inputCls}
                                />
                              </Field>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeKpi(kraIdx, kpiIdx)}
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition mt-5"
                            title="Remove KPI"
                            disabled={kra.kpis.length <= 1}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sticky save footer */}
      <div className="sticky bottom-4 z-10 mt-5 flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl shadow-md px-4 py-3">
        <div className="text-xs text-gray-600">
          {canSave ? (
            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
              <Check size={12} /> Ready to save
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
              <AlertTriangle size={12} /> {(() => {
                if (!draft.name.trim()) return "Name required";
                if (!draft.departmentId) return "Department required";
                if (!draft.effectiveFrom) return "Effective date required";
                if (!kraSumValid) return `KRA weights sum to ${kraSum}% (need 100)`;
                const bad = draft.kras.findIndex((k) => Math.abs(sumWeight(k.kpis) - 100) >= 0.01);
                if (bad >= 0) return `KRA "${draft.kras[bad].title || `#${bad + 1}`}" KPI weights sum to ${sumWeight(draft.kras[bad].kpis)}% (need 100)`;
                return "Fix missing titles";
              })()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/performance/kra-templates"
            className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="button"
            disabled={!canSave || saveMut.isPending}
            onClick={() => saveMut.mutate()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md text-xs font-medium"
          >
            {saveMut.isPending && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            <Save size={13} /> {saveMut.isPending ? "Saving…" : isEdit ? "Save changes" : "Create scorecard"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-[#166534]/20 focus:border-[#166534]";

function Field({
  label, required, compact, children,
}: { label: string; required?: boolean; compact?: boolean; children: React.ReactNode }) {
  return (
    <div className={compact ? "" : "space-y-1"}>
      <label className={clsx("block text-xs font-medium text-gray-700", compact && "mb-1")}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function WeightBadge({ sum, small }: { sum: number; small?: boolean }) {
  const valid = Math.abs(sum - 100) < 0.01;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full font-semibold tabular-nums",
        small ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-[11px]",
        valid
          ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200"
          : "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
      )}
      title={valid ? "Weights total 100%" : `Total ${sum}%, target 100%`}
    >
      {valid ? <Check size={small ? 9 : 10} /> : <AlertTriangle size={small ? 9 : 10} />}
      {sum}%
    </span>
  );
}
