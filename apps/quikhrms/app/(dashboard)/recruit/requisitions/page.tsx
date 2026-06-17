"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { clsx } from "clsx";
import { Plus, Briefcase, Filter, X, AlertTriangle, Check, XCircle, Pause, Play, Pencil, Sparkles, Trash2, Target, ChevronDown } from "lucide-react";
import { SkeletonTable } from "@/components/hrms/skeleton";

interface DeptOption { id: string; name: string; code?: string | null; }
interface PipelineOption { id: string; name: string; isDefault: boolean; stages: { name: string }[]; }

interface SkillWeightItem { skill: string; weight: number }
interface ReqItem {
  id: string;
  requisitionNumber: string;
  title: string;
  positions: number;
  filledPositions: number;
  type: string;
  employmentType: string;
  status: string;
  priority: string;
  pipelineId: string | null;
  jobDescription?: string | null;
  skillWeights?: SkillWeightItem[] | null;
  department: { id: string; name: string } | null;
  hiringManager: { id: string; firstName: string; lastName: string } | null;
  _count: { applications: number };
}

const statusColors: Record<string, string> = {
  ReqDraft: "bg-gray-100 text-gray-600",
  PendingApproval: "bg-yellow-100 text-yellow-700",
  ReqApproved: "bg-[#dbeafe] text-[#2563eb]",
  ReqOpen: "bg-green-100 text-green-700",
  ReqOnHold: "bg-orange-100 text-orange-700",
  ReqClosed: "bg-gray-100 text-gray-500",
  ReqCancelled: "bg-red-100 text-red-700",
};

const priorityColors: Record<string, string> = {
  Low: "text-gray-400", Medium: "text-[#3b82f6]", High: "text-orange-500", Urgent: "text-red-600",
};

function prettyStatus(s: string): string {
  return s
    .replace(/^Req/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

type ActionVariant = "green" | "blue" | "orange" | "red" | "slate";

const actionVariants: Record<ActionVariant, string> = {
  green:  "bg-green-50 text-green-700 ring-green-200 hover:bg-green-100 hover:ring-green-300",
  blue:   "bg-[#dbeafe] text-[#2563eb] ring-[#bfdbfe] hover:bg-[#dbeafe] hover:ring-[#bfdbfe]",
  orange: "bg-orange-50 text-orange-700 ring-orange-200 hover:bg-orange-100 hover:ring-orange-300",
  red:    "bg-red-50 text-red-700 ring-red-200 hover:bg-red-100 hover:ring-red-300",
  slate:  "bg-slate-50 text-slate-700 ring-slate-200 hover:bg-slate-100 hover:ring-slate-300",
};

function ActionBtn({
  icon, children, variant, onClick,
}: { icon: React.ReactNode; children: React.ReactNode; variant: ActionVariant; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold ring-1 transition shadow-sm",
        actionVariants[variant],
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export default function RequisitionsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [cancelTarget, setCancelTarget] = useState<ReqItem | null>(null);
  const emptyForm = {
    title: "",
    departmentId: "",
    pipelineId: "",
    positions: 1,
    priority: "Medium" as string,
    employmentType: "FullTime" as string,
    workLocation: "Office" as string,
    jobDescription: "",
    skillWeights: [] as SkillWeightItem[],
    // Role Scorecard fields
    rolePurpose: "",
    responsibilities: [] as string[],
  };
  const [form, setForm] = useState(emptyForm);
  const [skillDraft, setSkillDraft] = useState("");
  const [weightDraft, setWeightDraft] = useState(7);

  const params = new URLSearchParams({ limit: "100", ...(statusFilter && { status: statusFilter }) });

  const { data, isLoading } = useQuery({
    queryKey: ["requisitions", statusFilter],
    queryFn: () => api.get<ReqItem[]>(`/api/v1/hrms/recruit/requisitions?${params}`),
  });

  const { data: deptsData } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<DeptOption[]>("/api/v1/hrms/departments?limit=200"),
  });
  const departments = deptsData?.data ?? [];

  const { data: pipelinesData } = useQuery({
    queryKey: ["pipelines"],
    queryFn: () => api.get<PipelineOption[]>("/api/v1/hrms/recruit/pipelines"),
  });
  const pipelines = pipelinesData?.data ?? [];

  const createMut = useMutation({
    mutationFn: (body: typeof form) => api.post("/api/v1/hrms/recruit/requisitions", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["requisitions"] }); setShowCreate(false); },
  });

  const editMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: typeof form }) =>
      api.patch(`/api/v1/hrms/recruit/requisitions/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["requisitions"] }); setEditId(null); setShowCreate(false); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/api/v1/hrms/recruit/requisitions/${id}`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["requisitions"] }); setCancelTarget(null); },
  });

  const reqs = data?.data ?? [];

  return (
    <div className="w-full px-6 py-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900">Job requisitions</h1>
        <button onClick={() => { setForm(emptyForm); setEditId(null); setShowCreate(true); }}
          className="btn btn-primary">
          <Plus size={14} /> New requisition
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 mr-1">
            <Filter size={13} /> Status
          </div>
          {[
            { value: "", label: "All" },
            { value: "ReqDraft", label: "Draft" },
            { value: "ReqOpen", label: "Open" },
            { value: "ReqOnHold", label: "On Hold" },
            { value: "ReqClosed", label: "Closed" },
            { value: "ReqCancelled", label: "Cancelled" },
          ].map((s) => {
            const active = statusFilter === s.value;
            return (
              <button
                key={s.value || "all"}
                onClick={() => setStatusFilter(s.value)}
                className={clsx(
                  "inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border transition",
                  active
                    ? "bg-[#16243A] border-[#16243A] text-white shadow-sm"
                    : "bg-white border-[var(--border)] text-gray-600 hover:border-[#16243A]/40 hover:text-[#16243A]",
                )}
              >
                {s.label}
                {active && s.value && <X size={11} className="ml-0.5" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? <div className="p-4"><SkeletonTable rows={6} cols={5} /></div> : reqs.length === 0 ? (
          <div className="p-8 text-center text-gray-500"><Briefcase size={32} className="mx-auto mb-2 text-gray-300" />No requisitions</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Requisition</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Department</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Positions</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Applications</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Priority</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reqs.map((r, i) => (
                <tr key={r.id} className="row-stagger border-b border-gray-100 hover:bg-gray-50" style={{ ["--i" as never]: Math.min(i, 10) }}>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{r.title}</p>
                    <p className="text-xs text-gray-500">{r.requisitionNumber} &middot; {r.employmentType}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{r.department?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-center">{r.filledPositions}/{r.positions}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-center">{r._count.applications}</td>
                  <td className="px-4 py-3">
                    <span className={clsx("text-sm font-medium", priorityColors[r.priority])}>{r.priority}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx("px-2 py-0.5 rounded-full text-xs font-medium", statusColors[r.status])}>{prettyStatus(r.status)}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5 justify-end">
                      {r.status !== "ReqCancelled" && r.status !== "ReqClosed" && (
                        <ActionBtn onClick={() => {
                          setForm({
                            title: r.title,
                            departmentId: r.department?.id ?? "",
                            pipelineId: r.pipelineId ?? "",
                            positions: r.positions,
                            priority: r.priority,
                            employmentType: r.employmentType,
                            workLocation: "Office",
                            jobDescription: r.jobDescription ?? "",
                            skillWeights: Array.isArray(r.skillWeights) ? r.skillWeights : [],
                            rolePurpose: (r as unknown as { rolePurpose?: string }).rolePurpose ?? "",
                            responsibilities: Array.isArray((r as unknown as { responsibilities?: unknown }).responsibilities) ? (r as unknown as { responsibilities: string[] }).responsibilities : [],
                          });
                          setEditId(r.id);
                          setShowCreate(true);
                        }} icon={<Pencil size={12} />} variant="blue">Edit</ActionBtn>
                      )}
                      {r.status === "ReqDraft" && (
                        <ActionBtn onClick={() => updateMut.mutate({ id: r.id, status: "ReqOpen" })}
                          icon={<Check size={12} />} variant="green">Open</ActionBtn>
                      )}
                      {r.status === "ReqOpen" && (
                        <ActionBtn onClick={() => updateMut.mutate({ id: r.id, status: "ReqClosed" })}
                          icon={<XCircle size={12} />} variant="slate">Close</ActionBtn>
                      )}
                      {(r.status === "ReqOpen" || r.status === "ReqApproved" || r.status === "ReqDraft") && (
                        <ActionBtn onClick={() => updateMut.mutate({ id: r.id, status: "ReqOnHold" })}
                          icon={<Pause size={12} />} variant="orange">On Hold</ActionBtn>
                      )}
                      {r.status === "ReqOnHold" && (
                        <ActionBtn onClick={() => updateMut.mutate({ id: r.id, status: "ReqOpen" })}
                          icon={<Play size={12} />} variant="blue">Resume</ActionBtn>
                      )}
                      {r.status !== "ReqCancelled" && r.status !== "ReqClosed" && (
                        <ActionBtn onClick={() => setCancelTarget(r)}
                          icon={<X size={12} />} variant="red">Cancel</ActionBtn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setEditId(null); }} title={editId ? "Edit Requisition" : "New Job Requisition"}>
        <form onSubmit={(e) => { e.preventDefault(); editId ? editMut.mutate({ id: editId, body: form }) : createMut.mutate(form); }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job Title <span className="text-red-500">*</span></label>
            <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Department <span className="text-red-500">*</span>
            </label>
            <Select
              value={form.departmentId}
              onChange={(v) => setForm({ ...form, departmentId: v })}
              placeholder={departments.length === 0 ? "No departments — create under Organization" : "Select department"}
              searchable
              options={departments.map((d) => ({
                value: d.id,
                label: d.name,
                description: d.code ?? undefined,
              }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hiring Pipeline <span className="text-red-500">*</span></label>
            <Select
              value={form.pipelineId}
              onChange={(v) => setForm({ ...form, pipelineId: v })}
              placeholder={pipelines.length === 0 ? "No pipelines — create under Settings → Pipelines" : "Select hiring pipeline"}
              searchable
              options={pipelines.map((p) => ({
                value: p.id,
                label: p.name + (p.isDefault ? " (default)" : ""),
                description: p.stages.map((s) => s.name.replace(/([A-Z])/g, " $1").trim()).join(" → "),
              }))}
            />
            <p className="mt-1 text-[11px] text-gray-400">Candidates applying to this role will flow through the selected pipeline.</p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Positions</label>
              <NumberInput allowDecimal={false} min={1} value={form.positions} onChange={(v) => setForm({ ...form, positions: v ?? 1 })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <Select
                value={form.priority}
                onChange={(v) => setForm({ ...form, priority: v })}
                options={["Low", "Medium", "High", "Urgent"].map((p) => ({ value: p, label: p }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <Select
                value={form.employmentType}
                onChange={(v) => setForm({ ...form, employmentType: v })}
                options={["FullTime", "PartTime", "Contract", "Intern"].map((t) => ({ value: t, label: t }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job Description</label>
            <textarea value={form.jobDescription} onChange={(e) => setForm({ ...form, jobDescription: e.target.value })} rows={4}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
          </div>

          <RoleScorecardSection form={form} setForm={setForm} />

          <div className="rounded-lg border border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] to-white p-3">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1e40af]">
                  <Sparkles size={14} /> ATS Skill Weights
                </div>
                <p className="text-[11px] text-gray-600 mt-0.5">
                  Weight = importance (1 low, 10 critical). OpenAI uses these to score candidate resumes. Example: React → 9, AWS → 5
                </p>
              </div>
              <span className="text-[11px] text-gray-500 whitespace-nowrap">{form.skillWeights.length} skill{form.skillWeights.length === 1 ? "" : "s"}</span>
            </div>

            {form.skillWeights.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {form.skillWeights.map((sw, idx) => (
                  <div key={`${sw.skill}-${idx}`} className="flex items-center gap-2 bg-white border border-gray-200 rounded-md px-2 py-1.5">
                    <span className="flex-1 text-xs font-semibold text-gray-800 truncate">{sw.skill}</span>
                    <div className="flex items-center gap-1 w-48">
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={sw.weight}
                        onChange={(e) => {
                          const w = Number(e.target.value);
                          setForm((p) => ({ ...p, skillWeights: p.skillWeights.map((x, i) => i === idx ? { ...x, weight: w } : x) }));
                        }}
                        className="flex-1 accent-[#2563eb]"
                      />
                      <span className="text-xs font-bold text-[#2563eb] w-6 text-right">{sw.weight}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, skillWeights: p.skillWeights.filter((_, i) => i !== idx) }))}
                      className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                      title="Remove"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={skillDraft}
                onChange={(e) => setSkillDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const s = skillDraft.trim();
                    if (s && !form.skillWeights.some((x) => x.skill.toLowerCase() === s.toLowerCase())) {
                      setForm((p) => ({ ...p, skillWeights: [...p.skillWeights, { skill: s, weight: weightDraft }] }));
                      setSkillDraft("");
                    }
                  }
                }}
                placeholder="e.g., React, AWS, System Design"
                className="flex-1 border border-[var(--border)] rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#16243A]"
              />
              <div className="flex items-center gap-1">
                <label className="text-[10px] font-semibold text-gray-500">W</label>
                <select
                  value={weightDraft}
                  onChange={(e) => setWeightDraft(Number(e.target.value))}
                  className="border border-[var(--border)] rounded-md px-1.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#16243A]"
                >
                  {[1,2,3,4,5,6,7,8,9,10].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  const s = skillDraft.trim();
                  if (!s) return;
                  if (form.skillWeights.some((x) => x.skill.toLowerCase() === s.toLowerCase())) return;
                  setForm((p) => ({ ...p, skillWeights: [...p.skillWeights, { skill: s, weight: weightDraft }] }));
                  setSkillDraft("");
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#16243A] hover:bg-[#1E3354] text-white rounded-md text-xs font-semibold"
              >
                <Plus size={12} /> Add
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => { setShowCreate(false); setEditId(null); }} className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={createMut.isPending || editMut.isPending || !form.pipelineId || !form.title.trim() || !form.departmentId}
              className="px-4 py-2 bg-[#16243A] text-white rounded-lg text-sm font-medium hover:bg-[#2563eb] disabled:opacity-50">
              {editId ? (editMut.isPending ? "Saving..." : "Save Changes") : (createMut.isPending ? "Creating..." : "Create")}
            </button>
          </div>
        </form>
      </Modal>

      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => !updateMut.isPending && setCancelTarget(null)}
          />
          <div className="relative bg-white rounded-xl shadow-2xl ring-1 ring-slate-200 w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="shrink-0 flex items-center justify-center w-12 h-12 rounded-full bg-red-50 ring-4 ring-red-50/60">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900">Cancel Requisition</h3>
                  <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">
                    Are you sure you want to cancel{" "}
                    <span className="font-semibold text-slate-700">&quot;{cancelTarget.title}&quot;</span>{" "}
                    <span className="text-slate-400">({cancelTarget.requisitionNumber})</span>?
                  </p>
                  <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-2.5 py-1.5">
                    This will stop all hiring activity. Candidates already applied will be notified. This action cannot be undone.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 bg-slate-50 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                disabled={updateMut.isPending}
                className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
              >
                Keep Open
              </button>
              <button
                type="button"
                onClick={() => updateMut.mutate({ id: cancelTarget.id, status: "ReqCancelled" })}
                disabled={updateMut.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-red-600 to-blue-600 hover:from-red-700 hover:to-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm disabled:opacity-50 transition"
              >
                {updateMut.isPending ? "Cancelling..." : "Yes, Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Role Scorecard section (collapsible) ────────────────────────────────
   Optional fields modeled on the JD-Scorecard pattern:
   - Role Purpose: 1-2 sentences ("why this role exists")
   - Key Responsibilities
*/

interface ScorecardForm {
  rolePurpose: string;
  responsibilities: string[];
}

function RoleScorecardSection<T extends ScorecardForm>({
  form, setForm,
}: {
  form: T;
  setForm: React.Dispatch<React.SetStateAction<T>>;
}) {
  const [open, setOpen] = useState(false);

  const filled =
    (form.rolePurpose.trim() ? 1 : 0)
    + form.responsibilities.length;

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-gray-50 transition rounded-lg"
      >
        <div className="flex items-center gap-2">
          <Target size={14} className="text-[#16243A]" />
          <span className="text-sm font-semibold text-gray-800">Role Scorecard</span>
          <span className="text-[11px] text-gray-500 font-normal">(optional)</span>
          {filled > 0 && (
            <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 text-[10px] font-bold tabular-nums">
              {filled} field{filled === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <ChevronDown
          size={14}
          className={`text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-gray-100">
          <p className="text-[11px] text-gray-500">
            Captures the success criteria of the role — shared with candidates and used during onboarding & reviews.
          </p>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">
              Role purpose
            </label>
            <textarea
              rows={2}
              value={form.rolePurpose}
              onChange={(e) => setForm((p) => ({ ...p, rolePurpose: e.target.value }))}
              placeholder="e.g. Own enterprise growth by building a predictable sales pipeline and driving strategic account expansion."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16243A]/20 focus:border-[#16243A] resize-none"
            />
            <p className="mt-1 text-[10px] text-gray-400">{form.rolePurpose.length} / 500 characters · 1–2 sentences</p>
          </div>

          <BulletListField
            label="Key responsibilities"
            placeholder="e.g. Run discovery workshops and consulting discussions"
            items={form.responsibilities}
            onChange={(next) => setForm((p) => ({ ...p, responsibilities: next }))}
          />
        </div>
      )}
    </div>
  );
}

function BulletListField({
  label, placeholder, items, onChange,
}: {
  label: string;
  placeholder: string;
  items: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, v]);
    setDraft("");
  };
  return (
    <div>
      <label className="block text-gray-700 mb-1 text-xs font-bold uppercase tracking-wide">{label}</label>
      {items.length > 0 && (
        <ul className="space-y-1 mb-1.5">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2 bg-gray-50 ring-1 ring-gray-100 rounded px-2 py-1 text-sm text-gray-800">
              <span className="text-gray-300">•</span>
              <span className="flex-1">{it}</span>
              <button
                type="button"
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                className="text-gray-400 hover:text-red-600"
                aria-label="Remove"
              >
                <X size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16243A]/20 focus:border-[#16243A]"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className="px-2.5 py-1.5 bg-[#16243A] hover:bg-[#1E3354] disabled:opacity-50 text-white rounded-md text-xs font-semibold"
        >
          <Plus size={11} />
        </button>
      </div>
    </div>
  );
}

