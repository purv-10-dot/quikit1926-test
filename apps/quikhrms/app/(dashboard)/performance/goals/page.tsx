"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { todayInput } from "@/lib/utils/date-input";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { clsx } from "clsx";
import { Plus, Target, TrendingUp, Trash2, BarChart3 } from "lucide-react";
import { SkeletonCards } from "@/components/hrms/skeleton";
import { useDialog } from "@/components/hrms/dialog";
import { useToast } from "@/components/hrms/toast";

interface GoalItem {
  id: string;
  title: string;
  description: string | null;
  type: string;
  category: string;
  targetValue: string;
  currentValue: string;
  unit: string | null;
  weight: string;
  startDate: string;
  dueDate: string;
  status: string;
  progress: string;
  employee: { id: string; firstName: string; lastName: string; employeeCode: string };
  keyResults: Array<{ id: string; title: string; targetValue: string; currentValue: string; status: string }>;
  _count: { checkIns: number; childGoals: number };
}

const statusColors: Record<string, string> = {
  NotStarted: "bg-gray-100 text-gray-600",
  InProgress: "bg-[#dcfce7] text-[#16a34a]",
  AtRisk: "bg-red-100 text-red-700",
  Completed: "bg-green-100 text-green-700",
  Exceeded: "bg-emerald-100 text-emerald-700",
  Deferred: "bg-yellow-100 text-yellow-700",
  Cancelled: "bg-gray-100 text-gray-400",
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export default function GoalsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const dialog = useDialog();
  const toast = useToast();

  const deleteGoalMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/performance/goals/${id}`),
    onSuccess: () => {
      toast.success("Goal deleted");
      qc.invalidateQueries({ queryKey: ["goals"] });
    },
  });

  const confirmDeleteGoal = async (g: GoalItem) => {
    const ok = await dialog.confirm({
      title: "Delete this goal?",
      description: `"${g.title}" will be removed permanently.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (ok) deleteGoalMut.mutate(g.id);
  };
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    type: "Individual" as "Individual" | "Department",
    employeeId: "", departmentId: "",
    title: "", description: "",
    metric: "", targetValue: 100, unit: "%", weight: 0,
    startDate: "", dueDate: "",
    alignedTo: "",
    keyResults: [] as Array<{ title: string; targetValue: number; unit: string; weight: number }>,
  });

  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["goals", statusFilter, typeFilter, employeeFilter],
    queryFn: () => {
      const p = new URLSearchParams({ limit: "100" });
      if (statusFilter) p.set("status", statusFilter);
      if (typeFilter) p.set("type", typeFilter);
      if (employeeFilter) p.set("employeeId", employeeFilter);
      return api.get<GoalItem[]>(`/api/v1/hrms/performance/goals?${p.toString()}`);
    },
  });

  const { data: employeesData } = useQuery({
    queryKey: ["employees-for-goals"],
    queryFn: () => api.get<Array<{ id: string; firstName: string; lastName: string; employeeCode: string }>>("/api/v1/hrms/employees?limit=200"),
  });
  const employees = employeesData?.data ?? [];

  const { data: deptsData } = useQuery({
    queryKey: ["depts-for-goals"],
    queryFn: () => api.get<Array<{ id: string; name: string; headId: string | null }>>("/api/v1/hrms/departments?limit=200"),
  });
  const departments = deptsData?.data ?? [];

  const createMut = useMutation({
    mutationFn: (body: typeof form) => {
      let ownerId = "";
      let visibility: "Private" | "DepartmentVisible" = "Private";
      if (body.type === "Individual") {
        ownerId = body.employeeId;
        visibility = "Private";
      } else if (body.type === "Department") {
        const d = departments.find((x) => x.id === body.departmentId);
        ownerId = d?.headId ?? "";
        visibility = "DepartmentVisible";
      }

      const payload: Record<string, unknown> = {
        type: body.type,
        category: "Business",
        visibility,
        title: body.title,
        description: body.description,
        metric: body.metric,
        targetValue: body.targetValue,
        unit: body.unit,
        weight: body.weight,
        startDate: body.startDate,
        dueDate: body.dueDate,
        alignedTo: body.alignedTo,
        keyResults: body.keyResults,
      };
      if (ownerId) payload.employeeId = ownerId;
      if (!body.alignedTo) delete payload.alignedTo;
      if (!body.metric) delete payload.metric;
      if (!body.description) delete payload.description;
      if (!body.keyResults?.length) delete payload.keyResults;
      else payload.keyResults = body.keyResults.filter((kr) => kr.title.trim().length > 0);
      return api.post("/api/v1/hrms/performance/goals", payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["goals"] }); setShowCreate(false); },
  });

  const checkInMut = useMutation({
    mutationFn: ({ id, currentValue, note }: { id: string; currentValue: number; note?: string }) =>
      api.post(`/api/v1/hrms/performance/goals/${id}/check-in`, { currentValue, note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      toast.success("Progress updated");
      setCheckInGoal(null);
    },
  });

  // Goal currently being checked in (null = modal closed).
  const [checkInGoal, setCheckInGoal] = useState<GoalItem | null>(null);
  const [checkInValue, setCheckInValue] = useState<number | null>(null);
  const [checkInNote, setCheckInNote] = useState("");

  const openCheckIn = (g: GoalItem) => {
    setCheckInGoal(g);
    setCheckInValue(Number(g.currentValue));
    setCheckInNote("");
  };

  const goals = data?.data ?? [];

  return (
    <div className="w-full px-5 py-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-page-title text-gray-900">Goals &amp; OKRs</h1>
        <button onClick={() => { setForm({ type: "Individual", employeeId: "", departmentId: "", title: "", description: "", metric: "", targetValue: 100, unit: "%", weight: 0, startDate: "", dueDate: "", alignedTo: "", keyResults: [] }); setShowCreate(true); }}
          className="btn btn-primary">
          <Plus size={13} /> New goal
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          className="w-44"
          options={[
            { value: "", label: "All statuses" },
            { value: "NotStarted", label: "Not Started" },
            { value: "InProgress", label: "In Progress" },
            { value: "AtRisk", label: "At Risk" },
            { value: "Completed", label: "Completed" },
            { value: "Cancelled", label: "Cancelled" },
          ]}
        />
        <Select
          value={typeFilter}
          onChange={setTypeFilter}
          className="w-40"
          options={[
            { value: "", label: "All types" },
            { value: "Individual", label: "Individual" },
            { value: "Department", label: "Department" },
            { value: "Company", label: "Company" },
          ]}
        />
        <Select
          value={employeeFilter}
          onChange={setEmployeeFilter}
          searchable
          className="w-56"
          options={[
            { value: "", label: "All employees" },
            ...employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName} (${e.employeeCode})` })),
          ]}
        />
        {(statusFilter || typeFilter || employeeFilter) && (
          <button
            type="button"
            onClick={() => { setStatusFilter(""); setTypeFilter(""); setEmployeeFilter(""); }}
            className="text-xs text-[#22c55e] hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      {isLoading ? (
        <SkeletonCards count={6} />
      ) : goals.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">
          <Target size={32} className="mx-auto mb-2 text-gray-300" />
          No goals yet
        </div>
      ) : (
        <div className="space-y-3">
          {goals.map((g, i) => {
            const progress = Number(g.progress);
            return (
              <div key={g.id} className="row-stagger bg-white rounded-lg shadow-sm border border-gray-200 p-4" style={{ ["--i" as never]: Math.min(i, 10) }}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[13px] font-semibold text-gray-900">{g.title}</h3>
                      <span className={clsx("px-2 py-0.5 rounded-full text-[11px] font-medium", statusColors[g.status])}>{g.status}</span>
                      <span className="text-[11px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{g.type}</span>
                    </div>
                    {g.description && <p className="text-xs text-gray-500 mt-1">{g.description}</p>}
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                      <span>{g.employee.firstName} {g.employee.lastName}</span>
                      <span>{formatDate(g.startDate)} — {formatDate(g.dueDate)}</span>
                      <span>Weight: {Number(g.weight)}%</span>
                      {g._count.checkIns > 0 && <span>{g._count.checkIns} check-ins</span>}
                    </div>
                  </div>
                  <div className="flex items-start gap-3 ml-4">
                    <div className="text-right">
                      <p className="text-base font-bold text-gray-900">{progress.toFixed(0)}%</p>
                      <p className="text-xs text-gray-500">{Number(g.currentValue)}/{Number(g.targetValue)} {g.unit}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openCheckIn(g)}
                      title="Update progress"
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-normal text-[#166534] bg-[#166534]/10 hover:bg-[#166534] hover:text-white rounded transition"
                    >
                      <BarChart3 size={12} /> Check in
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmDeleteGoal(g)}
                      title="Delete goal"
                      className="p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 rounded transition"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
                  <div
                    className={clsx(
                      "h-2 rounded-full transition-all",
                      progress >= 100 ? "bg-emerald-500"
                        : progress >= 50 ? "bg-green-500"
                        : progress > 0 ? "bg-amber-500"
                        : "bg-gray-300",
                    )}
                    style={{ width: `${Math.min(100, progress)}%` }}
                  />
                </div>
                {/* Key Results */}
                {g.keyResults.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {g.keyResults.map((kr) => (
                      <div key={kr.id} className="flex items-center gap-2 text-xs">
                        <TrendingUp size={12} className="text-gray-400" />
                        <span className="text-gray-700 flex-1">{kr.title}</span>
                        <span className="text-xs text-gray-500">{Number(kr.currentValue)}/{Number(kr.targetValue)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} size="2xl" title="New Goal">
        <form onSubmit={(e) => {
          e.preventDefault();
          if (!form.title.trim()) return toast.error("Title is required");
          if (!form.startDate || !form.dueDate) return toast.error("Start and due dates are required");
          if (form.dueDate < form.startDate) return toast.error("Due date must be on or after the start date");
          if (form.weight < 0 || form.weight > 100) return toast.error("Weight must be between 0 and 100");
          if (form.keyResults.some((k) => k.weight < 0 || k.weight > 100)) return toast.error("Key-result weights must be between 0 and 100");
          createMut.mutate(form);
        }} className="space-y-4">

          {/* Two equal columns so the form fits without scrolling. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          {/* ── Left column ─────────────────────────────── */}
          <div className="space-y-4">
          {/* ── Scope ─────────────────────────────────── */}
          <section className="space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#166534]">Scope</h4>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Goal type</label>
              <div className="grid grid-cols-2 gap-2">
                {(["Individual", "Department"] as const).map((t) => (
                  <label
                    key={t}
                    className={clsx(
                      "flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition",
                      form.type === t
                        ? "border-[#166534] bg-[#166534]/5 ring-1 ring-[#166534]/30"
                        : "border-[var(--border)] hover:bg-gray-50",
                    )}
                  >
                    <input
                      type="radio"
                      name="goalType"
                      value={t}
                      checked={form.type === t}
                      onChange={() => setForm({ ...form, type: t, employeeId: "", departmentId: "" })}
                      className="accent-[#166534]"
                    />
                    <span className="text-sm font-medium text-gray-800">{t}</span>
                  </label>
                ))}
              </div>
            </div>
            {form.type === "Individual" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employee <span className="text-gray-400 font-normal">(blank = yourself)</span></label>
                <Select
                  value={form.employeeId}
                  onChange={(v) => setForm({ ...form, employeeId: v })}
                  placeholder="Myself"
                  searchable
                  options={[
                    { value: "", label: "Myself" },
                    ...employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName} (${e.employeeCode})` })),
                  ]}
                />
              </div>
            )}
            {form.type === "Department" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department <span className="text-red-500">*</span></label>
                <Select
                  value={form.departmentId}
                  onChange={(v) => setForm({ ...form, departmentId: v })}
                  placeholder="Select department"
                  searchable
                  options={departments.map((d) => ({ value: d.id, label: d.name }))}
                />
                <p className="text-[11px] text-gray-400 mt-1">Visible to whole department. Owner = dept head.</p>
              </div>
            )}
          </section>

          {/* ── What ──────────────────────────────────── */}
          <section className="space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#166534]">What</h4>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Goal title <span className="text-red-500">*</span></label>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required
                placeholder="e.g. Increase MRR by 20% in Q2"
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#166534]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Why does this matter?</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2}
                placeholder="Context, motivation, expected outcome…"
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#166534]" />
            </div>
          </section>
          </div>

          {/* ── Right column ────────────────────────────── */}
          <div className="space-y-4">
          {goals.length > 0 && (
            <section>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#166534] mb-2">Alignment</h4>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Aligned to <span className="text-gray-400 font-normal">(parent goal — optional)</span></label>
                <Select
                  value={form.alignedTo}
                  onChange={(v) => setForm({ ...form, alignedTo: v })}
                  placeholder="None"
                  searchable
                  options={[{ value: "", label: "None" }, ...goals.map((g) => ({ value: g.id, label: g.title }))]}
                />
              </div>
            </section>
          )}

          {/* ── Measure ───────────────────────────────── */}
          <section className="space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#166534]">Measure</h4>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Metric <span className="text-gray-400 font-normal">(what you track)</span></label>
              <input type="text" value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })}
                placeholder="e.g. Monthly Revenue, NPS score, Tickets closed"
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#166534]" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target value</label>
                <NumberInput value={form.targetValue} onChange={(v) => setForm({ ...form, targetValue: v ?? 0 })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#166534]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                <input type="text" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="%, $, count…"
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#166534]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" title="Weight in review score (0–100)">Weight %</label>
                <NumberInput value={form.weight} onChange={(v) => setForm({ ...form, weight: v ?? 0 })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#166534]" />
              </div>
            </div>
            <p className="text-[11px] text-gray-400 -mt-1">Weight = how much this goal counts toward overall review score.</p>
          </section>

          {/* ── Timeline ──────────────────────────────── */}
          <section>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#166534] mb-2">Timeline</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start date <span className="text-red-500">*</span></label>
                <input type="date" value={form.startDate} min={todayInput()} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#166534]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due date <span className="text-red-500">*</span></label>
                <input type="date" value={form.dueDate} min={todayInput()} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} required
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#166534]" />
              </div>
            </div>
          </section>
          </div>
          </div>

          {/* ── Key Results ───────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#166534]">Key Results <span className="text-gray-400 font-normal normal-case tracking-normal">(optional)</span></h4>
              <button type="button" onClick={() => setForm({ ...form, keyResults: [...form.keyResults, { title: "", targetValue: 0, unit: "", weight: 0 }] })}
                className="text-xs font-semibold text-[#22c55e] hover:underline inline-flex items-center gap-1">
                <Plus size={12} /> Add KR
              </button>
            </div>
            {form.keyResults.length === 0 ? (
              <p className="text-xs text-gray-400">Break the goal into 2–4 measurable outcomes.</p>
            ) : (
              <div className="space-y-2">
                {form.keyResults.map((kr, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-start">
                    <input type="text" placeholder="KR title" value={kr.title}
                      onChange={(e) => { const next = [...form.keyResults]; next[i] = { ...kr, title: e.target.value }; setForm({ ...form, keyResults: next }); }}
                      className="col-span-6 border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#166534]" />
                    <input type="number" placeholder="Target" value={kr.targetValue}
                      onChange={(e) => { const next = [...form.keyResults]; next[i] = { ...kr, targetValue: Number(e.target.value) }; setForm({ ...form, keyResults: next }); }}
                      className="col-span-2 border border-[var(--border)] rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#166534]" />
                    <input type="text" placeholder="Unit" value={kr.unit}
                      onChange={(e) => { const next = [...form.keyResults]; next[i] = { ...kr, unit: e.target.value }; setForm({ ...form, keyResults: next }); }}
                      className="col-span-2 border border-[var(--border)] rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#166534]" />
                    <input type="number" placeholder="Wt%" value={kr.weight}
                      onChange={(e) => { const next = [...form.keyResults]; next[i] = { ...kr, weight: Number(e.target.value) }; setForm({ ...form, keyResults: next }); }}
                      className="col-span-1 border border-[var(--border)] rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#166534]" />
                    <button type="button" onClick={() => setForm({ ...form, keyResults: form.keyResults.filter((_, j) => j !== i) })}
                      className="col-span-1 text-gray-400 hover:text-red-600 text-xs py-2">Remove</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
            <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium">Cancel</button>
            <button type="submit" disabled={createMut.isPending} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-60">
              {createMut.isPending ? "Creating…" : "Create goal"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─── Check-in modal ─────────────────────────────────────── */}
      <Modal
        open={!!checkInGoal}
        onClose={() => setCheckInGoal(null)}
        title="Update progress"
        subtitle={checkInGoal?.title}
        headerIcon={<BarChart3 size={20} />}
        size="sm"
        bodyClassName="p-0 overflow-y-auto"
      >
        {checkInGoal && (() => {
          const target = Number(checkInGoal.targetValue);
          const previous = Number(checkInGoal.currentValue);
          const value = checkInValue ?? 0;
          const newProgress = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
          const delta = value - previous;
          return (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (checkInValue == null) return;
                checkInMut.mutate({
                  id: checkInGoal.id,
                  currentValue: checkInValue,
                  note: checkInNote.trim() || undefined,
                });
              }}
              className="p-4 space-y-4"
            >
              {/* Current → New */}
              <div className="rounded-xl ring-1 ring-gray-200 bg-gray-50 p-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] uppercase text-gray-500 font-semibold">Previous</p>
                  <p className="text-sm font-bold text-gray-700 tabular-nums">
                    {previous} <span className="text-xs text-gray-400 font-normal">{checkInGoal.unit}</span>
                  </p>
                </div>
                <div className="border-x border-gray-200">
                  <p className="text-[10px] uppercase text-gray-500 font-semibold">Target</p>
                  <p className="text-sm font-bold text-gray-700 tabular-nums">
                    {target} <span className="text-xs text-gray-400 font-normal">{checkInGoal.unit}</span>
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-gray-500 font-semibold">New</p>
                  <p className="text-sm font-bold text-[#166534] tabular-nums">
                    {value} <span className="text-xs text-gray-400 font-normal">{checkInGoal.unit}</span>
                  </p>
                </div>
              </div>

              {/* Value input */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Achieved value <span className="text-red-500">*</span>
                  {checkInGoal.unit && <span className="text-gray-400 font-normal"> ({checkInGoal.unit})</span>}
                </label>
                <NumberInput
                  value={checkInValue}
                  onChange={(v) => setCheckInValue(v)}
                  min={0}
                  step={0.01}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#166534]/20 focus:border-[#166534]"
                />
                {delta !== 0 && (
                  <p className={clsx(
                    "mt-1 text-[11px] font-semibold",
                    delta > 0 ? "text-emerald-700" : "text-rose-700",
                  )}>
                    {delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(2)} from previous
                  </p>
                )}
              </div>

              {/* New progress preview */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-gray-700">New progress</span>
                  <span className="font-bold text-gray-900 tabular-nums">{newProgress}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={clsx(
                      "h-full transition-all",
                      newProgress >= 100 ? "bg-emerald-500" : newProgress >= 50 ? "bg-green-500" : "bg-amber-500",
                    )}
                    style={{ width: `${newProgress}%` }}
                  />
                </div>
              </div>

              {/* Optional note */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Note <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={checkInNote}
                  onChange={(e) => setCheckInNote(e.target.value)}
                  placeholder="What changed since last check-in?"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#166534]/20 focus:border-[#166534] resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setCheckInGoal(null)}
                  className="px-3 py-1.5 border border-gray-300 bg-white rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={checkInValue == null || checkInMut.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md text-xs font-medium"
                >
                  {checkInMut.isPending && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                  {checkInMut.isPending ? "Saving…" : "Save check-in"}
                </button>
              </div>
            </form>
          );
        })()}
      </Modal>
    </div>
  );
}
